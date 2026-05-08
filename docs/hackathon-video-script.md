# DealPulse — FY27 SKO FE Summit Hackathon Video Script

**Total runtime: 2:50** (under the 3:00 cap; ~10s buffer for upload trim).
**Format:** screen recording with voiceover.
**Hero account for the live ingest:** Meridian Systems — Serverless Cost
Refresh ($1.1M Q2 commit). The seeded note flips this opportunity from
yellow → green so the rollup change is visible on-screen within seconds.

> Pre-flight (do once before recording):
>
> ```bash
> npm run demo:reset && npm run setup:elastic && npm run seed:lookups \
>   && npm run seed:opportunities && npm run seed:demo-notes \
>   && npm run run:rollups && npm run run:alerts && npm run seed:demo-drafts
> ```
>
> Confirm with `npm run verify:demo`: 30 notes ingested, 3 high-severity
> escalations, Meridian rollup is green, and 5 drafts in `email-drafts`.
> Open three tabs ahead of time:
>
> 1. The app at `http://localhost:5173/risk` (Risk Tracker, signed in as
>    Steve Leung).
> 2. Kibana → **Workflows → Field Loop Post-Ingest Orchestration → Executions**.
> 3. The app at `http://localhost:5173/inbox?tab=drafts`.

---

## [0:00–0:15] Hook — the problem we haven't solved yet

**On screen:** `/risk` (Risk Tracker), filtered to Steve's portfolio. Cursor
hovers Meridian Systems — currently yellow.

> "I'm a Field Engineer at Elastic. Every Friday I write four Salesforce
> updates from four Granola notes. My manager re-reads the same notes to
> brief our director. By Sunday night, four people have re-typed the same
> intelligence three times — and the dashboards are still stale.
>
> DealPulse is what happens when you take Granola notes and put them into
> Elasticsearch — and let Workflows and Agent Builder do the rest."

---

## [0:15–0:55] Live ingest → Workflow fires → Risk Tracker recomputes live

**On screen:** terminal pane (split). Run one command that ingests today's
Meridian note via the existing ingest endpoint. (Use the prepared
`scripts/seed-demo-notes.ts` Meridian `daysAgo: 0` note as the source —
re-running that single seed simulates a fresh Granola ingest.)

> "Watch the Risk Tracker. I just ingested today's Meridian note —
> the customer agreed to sign at $1.1M ACV with a regional egress cap."

**Switch to Risk Tracker tab → refresh.** Meridian row flips yellow → green.
Expand the row.

> "Tech status, Path to Tech Win, what changed this week — all live, all
> from the meeting note. No cron, no overnight batch."

**Switch to Kibana Workflows tab.** Click into the latest execution.

> "Behind that ingest, an **Elastic Workflow** fired. Rollup refresh,
> drafter invocation, completion — every step logged with timestamps in
> Kibana. This isn't our app scheduling things. It's Elastic Workflows
> orchestrating the post-ingest pipeline."

---

## [0:55–1:40] Agent Builder → Follow-up Drafter — both voices

**On screen:** `/inbox?tab=drafts`.

> "Same ingest, second outcome. While the rollup was refreshing, an
> **Agent Builder** agent read the note — attendees, action items,
> commitments — and decided this one needed a customer recap."

**Click the Meridian draft → Open draft.**

> "Subject line, body, recipient pulled from the attendee list. Three
> sentences on what we aligned on, the egress cap clause, the end-of-June
> Phase-1 go-live commitment. Steve reads it, edits one line, sends.
> Thirty seconds instead of ten minutes."

**Scroll to the footer.**

> "And notice: 'Never auto-sent. Human sends only.' We are not building
> an autonomous email bot. We are building a **draft queue.**"

**Click the Helix Robotics internal draft.**

> "Same agent, different note, different voice. The Helix POC has a
> data-residency blocker, so the agent drafted an internal escalation to
> my manager — not a customer email. One trigger, two personas, two
> outputs."

---

## [1:40–2:15] The platform story — pure Elastic, no glue

**On screen:** stay on Drafts tab, then briefly back to Kibana Workflows.

> "The whole stack here is Elastic. Notes live in Elasticsearch. Rollups
> live in Elasticsearch. Drafts live in Elasticsearch. Embeddings come
> from Elastic Inference Service with the Jina model — no external API
> call. The orchestration is **Elastic Workflows**. The intelligence is
> **Agent Builder**. No Lambda, no Zapier, no LLM call that leaves your
> data perimeter."

---

## [2:15–2:40] Bonus — Chat as the ad-hoc surface

**On screen:** `/chat`. Type the question.

> "The Inbox surfaces what the agent decided to draft. Chat surfaces what
> *I* decide to ask."

**Type:** `Which of my Splunk-replacement deals are at risk this week?`

> "Three deals — Aurora, Helix, Polaris — same agent, same data, with
> citations back to the meeting notes. The agent stitched together a
> cross-account narrative I never built a dashboard for."

---

## [2:40–2:50] Close

**On screen:** back to `/risk`, full portfolio visible.

> "DealPulse — Granola captures the meeting; Elasticsearch is the spine;
> Workflows orchestrates; Agent Builder drafts; the FE reviews and sends.
>
> Field Engineers spend Friday selling, not re-typing notes.
> Pipeline truth, on Monday morning."

---

## Why this hits the rubric

- **FE Impact** — replaces 2–3 hours of Friday SE write-up with 20
  minutes of review; auto-renders six leadership dashboards from the
  same note ingest.
- **Use of Workflows + Agent Builder** — Workflows orchestrates the
  post-ingest pipeline (visible in Kibana with executions UI); Agent
  Builder powers both the auto-drafter and the chat surface, with
  citations back to source notes.
- **Polish & Usability** — every persona has a dedicated, opinionated
  view; no copy-paste between tools; live status flip during the demo.
- **Reusability** — the spine (notes index + rollup workers + agent)
  is account-agnostic; any FE team using Granola can adopt it.
- **Demo Quality** — single-account live ingest with visible state
  change, two distinct drafter voices, and a chat capstone — all in
  under three minutes.

---

## Recording tips

1. **Record at 1080p or higher.** Submission video lives on Drive; size
   is not a constraint.
2. **Pre-load every tab and ingest target.** The `seed-demo-notes`
   Meridian `daysAgo: 0` block IS the live-ingest payload — running it
   on camera is what causes the yellow → green flip. Do not run any
   other ingests during recording.
3. **Mute the dev server terminal output** so the screen capture stays
   clean — the Risk Tracker is the visible state change, not the logs.
4. **Don't read filenames or column headers aloud.** Say "the rollup
   recomputes" not "the `opportunity-rollups` index updates."
5. **Cut the close at exactly 2:48** so the upload doesn't bump 3:00.
