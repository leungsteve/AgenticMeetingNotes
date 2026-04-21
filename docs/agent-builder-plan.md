# Account Intelligence Agent — Design Note

**Date:** 2026-04-21  
**Status:** Phase 0 + Phase 1 in progress; Phase 2 + Phase 3 scaffolded

---

## 1. New Elasticsearch Indices

All new indices follow the `account-*` / `action-*` / `agent-*` naming convention so they can be given a separate IAM policy from the `granola-*` indices.

| Index | Purpose |
|---|---|
| `account-pursuit-team` | One doc per account. Stores the pursuit team roster (AE, SA, CA) plus account metadata. Manually managed via Settings UI. |
| `account-rollups` | Nightly (+ on-ingest) per-account rollup: meeting count, sentiment trend, open action items, last meeting date, competitors seen. |
| `action-items` | Denormalised copy of every action-item nested object from `granola-meeting-notes`. Enables "list all overdue items" without nested queries. |
| `agent-actions` | Audit log: every tool call made by the agent (who asked, what tool, input, output, latency). |
| `agent-alerts` | Agent-generated alerts: overdue commitments, stale accounts, at-risk signals. Surfaced in the Inbox page. |
| `agent-feedback` | Thumbs-up / thumbs-down on agent answers. Feeds the eval harness. |
| `integrations-slack-users` | Slack user ID → team member email mapping (Phase 3 scaffold). |

### Key Mapping Choices

- `account-pursuit-team` uses `account` as the document `_id` (keyword, the account name slug) so upserts are idempotent.
- `action-items` carries `source_note_id`, `account`, `owner`, `due_date`, `status` — enough for the agent to answer "what is overdue for Adobe?" with a single term+range query.
- `agent-alerts` has `alert_type` (keyword), `account`, `owner`, `severity` (keyword: low/medium/high), `read` (boolean), `created_at`.
- `agent-feedback` links `session_id`, `message_id`, `rating` (1 or -1), `comment`, and the full tool-call log.

---

## 2. Elastic Inference Service (EIS) Endpoints

Two endpoints are registered via `/_inference/`:

| Endpoint ID | Model | Use |
|---|---|---|
| `jina-embeddings-v3` | `jina_embeddings_v3` (Jina EIS task `text_embedding`) | Dense embeddings for `summary_embedding` + `transcript_semantic` |
| `jina-reranker-v2` | `jina_reranker_v2` (Jina EIS task `rerank`) | `text_similarity_reranker` in the retriever chain |

### Fallback Chain (registered in setup-elastic.ts)

1. Jina embeddings (primary)
2. `.elser_model_2` sparse (if Jina EIS not available)
3. BM25-only (always works — no ML required)

### Mapping Changes to `granola-meeting-notes`

Two new fields added:

```json
"summary_embedding":    { "type": "semantic_text", "inference_id": "jina-embeddings-v3" },
"transcript_semantic":  { "type": "semantic_text", "inference_id": "jina-embeddings-v3" }
```

If `semantic_text` is not available on the cluster (older serverless), `summary_embedding` falls back to `dense_vector` with `dims: 1024` (Jina v3 default) and the ingest pipeline handles the inference processor explicitly.

---

## 3. Ingest Pipeline Extensions

Extended `granola-notes-pipeline` with two new processors appended after the existing ones:

1. **`action-items` denormalizer** — a `foreach` processor (or script) that writes each action-item from the note to the `action-items` index via an Elasticsearch enrich processor. Because Elasticsearch ingest pipelines cannot directly index to another index, this is implemented as a script processor that calls a pipeline-watcher pattern; the actual fan-out is handled by the `rollup-worker` (see §6).

2. **Jina `transcript_semantic` inference** — runs after the summary embedding, with `ignore_missing: true` and `ignore_failure: true`.

---

## 4. Search Strategy

### Hybrid Search (Retriever API)

```
rrf(
  bm25(query → title^3, summary^2, transcript, key_topics),
  knn(query_vector → summary_embedding, k=20, num_candidates=100)
)
```

Applied via the new `ElasticService.hybridSearch()` helper that accepts a plain string query and returns scored, ranked hits.

### Reranker Pass

After RRF, top-20 candidates are re-ranked via:

```
text_similarity_reranker(
  inference_id: "jina-reranker-v2",
  field: "summary",
  return_docs: 8
)
```

`ElasticService.semanticSearchWithRerank()` wraps this entire flow.

### Account-scoped Search

All search helpers accept an optional `account` filter applied as a `filter` clause (not a `must`) so relevance scoring is not perturbed.

---

## 5. Agent: "Account Intelligence Agent"

Registered in Kibana Agent Builder (Phase 1) as a single agent with three persona system prompts selectable at runtime.

### Persona System Prompts

| Persona | Focus |
|---|---|
| `ae` (Account Executive) | Deal stage, competitive intel, next steps, budget signals, stakeholder map |
| `sa_ca` (SA / CA) | Technical environment, pain points, POC readiness, architecture decisions, commitments |
| `leader` (Leadership) | Account health rollups, sentiment trends, at-risk flags, pipeline coverage |

The leader persona defaults to rollup answers; it adds "Drill into raw notes →" citations only when the user asks for specifics.

### Agent Tools

#### Simple Read Tools (hosted as Kibana Custom Tools)

| Tool | Description |
|---|---|
| `search_notes` | BM25 search across title/summary/key_topics, filtered by account |
| `semantic_search_transcripts` | Hybrid + rerank search across transcripts |
| `get_note_by_id` | Fetch a single note by `note_id` |
| `get_account_brief` | Return the latest rollup for an account |
| `get_meeting_timeline` | Chronological list of meetings for an account |
| `list_open_action_items` | Query `action-items` for open/overdue items |
| `list_followups_due` | Commitments + next-meeting dates within a time window |
| `get_pursuit_team` | Fetch `account-pursuit-team` doc for an account |
| `list_my_accounts` | Accounts where the acting user appears in the pursuit team |
| `list_attendees_on_account` | Distinct attendees seen on account meetings |
| `list_competitors_seen` | Distinct `competitors_evaluating` values for an account |
| `search_lookups` | Query `granola-lookups` for dropdown data |

#### Composite Tools (hosted in MCP Server, imported by Agent Builder)

| Tool | Description |
|---|---|
| `compare_two_accounts` | Runs `get_account_brief` for two accounts and diffs the rollups |
| `build_call_prep_brief` | Assembles pursuit team + last 3 meetings + open items + sentiment into a single context block |
| `flag_at_risk_accounts` | Queries rollups for accounts with stale activity or negative sentiment trend |
| `summarize_recent_changes` | Diffs the last two rollup versions for an account to surface what changed |

#### Write Tools — SFDC Stubs (MCP Server)

| Tool | Description |
|---|---|
| `sfdc_update_opportunity` | Stub: writes an `agent-actions` audit doc; returns a mock SFDC response |
| `sfdc_log_call` | Stub: same pattern |
| `sfdc_create_task` | Stub: same pattern |

When `SALESFORCE_MODE=live` the stubs are replaced by `LiveSalesforceService` with real API calls. Only the implementation class changes; the tool signatures and audit log are identical.

#### Alert Tools

| Tool | Description |
|---|---|
| `create_alert` | Writes a doc to `agent-alerts` |
| `list_my_alerts` | Queries `agent-alerts` filtered by owner |

---

## 6. Workers

### Rollup Worker (`src/server/workers/rollup-worker.ts`)

- **Triggers:** (a) on-ingest hook called from `POST /api/ingest` after indexing, (b) nightly cron via `setInterval` in the server process.
- **What it does:** For a given account keyword, aggregates all `granola-meeting-notes` docs → computes meeting count, last meeting date, sentiment distribution, open action item count, competitor set, and a "momentum score". Upserts into `account-rollups` with `account` as `_id`.

### Alerts Worker (`src/server/workers/alerts-worker.ts`)

- Runs nightly (cron).
- Checks: (a) action items with `due_date < now` and `status: open`, (b) accounts with no meeting in >30 days (`stale`), (c) accounts where latest sentiment is `concerned` or `skeptical` (`at-risk`).
- Writes new alerts to `agent-alerts` (deduped on `alert_type + account + owner`).

### Audit Log Writer (`src/server/workers/audit-log.ts`)

- Exported as a thin function `logAgentAction(toolName, input, output, latencyMs, actingUser)`.
- Called from every MCP tool handler before returning.
- Writes to `agent-actions`.

### Eval Harness (`src/server/workers/eval-harness.ts`)

- Loads ~30 gold Q&A pairs per persona from `docs/eval/gold-*.jsonl`.
- Replays each question against the agent REST endpoint.
- Measures: accuracy (LLM-as-judge), citation precision (did the returned note IDs contain the answer?), latency p50/p95.
- Writes results to `docs/eval/results-{date}.json`.

---

## 7. New Routes (Backend)

| Route | Purpose |
|---|---|
| `GET/POST/PUT/DELETE /api/accounts` | CRUD for `account-pursuit-team` |
| `GET /api/rollups/:account` | Fetch latest rollup for an account |
| `GET /api/action-items` | List action items (filterable by account, owner, status) |
| `GET /api/alerts` | List alerts for the acting user |
| `POST /api/alerts/:id/read` | Mark an alert as read |
| `POST /api/chat` | SSE proxy to Kibana Agent Builder REST API (Phase 2) |
| `POST /api/feedback` | Write a thumbs rating to `agent-feedback` |

---

## 8. New UI Pages

| Route | Component | Phase |
|---|---|---|
| `/accounts` | `Accounts.tsx` | 1 |
| `/chat` | `Chat.tsx` | 2 (scaffold) |
| `/inbox` | `Inbox.tsx` | 1 |
| `/outbound-sfdc` | `OutboundSfdc.tsx` | 1 |

### Settings additions

- Pursuit team management section: select account → add/remove team members with role (AE/SA/CA).
- Quick links to each account's pursuit team from the Accounts page.

---

## 9. Slack Scaffold (Phase 3)

`src/server/integrations/slack/`

- `handler.ts` — Bolt-style HTTP handler for `/intelligence` slash command.
- `user-mapping.ts` — resolves Slack user ID to email via `integrations-slack-users` index.
- `router.ts` — registers the `/slack/events` Express route.

No live posting. Responses are `console.log`'d and the audit log captures them.

---

## 10. Security Model

- Every tool call carries the acting user's email (from `X-Acting-User` header or session).
- `document_level_security` on `granola-meeting-notes` and `action-items`: users can read docs where `author_email == acting_user OR attendee_names contains acting_user OR account-pursuit-team[account].members contains acting_user`.
- Leaders have a separate Kibana role with `*` on those indices.
- SFDC stubs always write the acting user to the audit log.

---

## 11. Execution Plan

### Phase 0 (done by setup-elastic.ts)
- Register Jina EIS endpoints (with fallback logic).
- Create new indices with mappings.
- Extend `granola-notes-pipeline` with new processors.
- Update `granola-meeting-notes` mappings via `putMapping` (additive only).

### Phase 1 (this build)
- Rollup worker + alerts worker.
- All agent tools (backend implementations).
- MCP server.
- Accounts, Inbox, OutboundSfdc pages.
- Settings pursuit-team section.

### Phase 2 (scaffold)
- Chat.tsx page with SSE.
- `POST /api/chat` proxy (disabled behind `AGENT_BUILDER_URL` env var guard).

### Phase 3 (scaffold)
- Slack handler files, no live posting.
