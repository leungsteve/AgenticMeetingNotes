# Granola → Elastic Meeting Intelligence Pipeline

**Stop taking notes. Start winning deals.**

This system turns every customer meeting into structured, searchable intelligence — automatically. Team members capture meetings in Granola, review and enrich the AI-generated notes in a web UI, and with one click push everything into Elastic Serverless. From there, an AI agent answers any question about any account in seconds: deal status, technical requirements, competitive landscape, open commitments, at-risk signals, and more.

---

## The Problem We're Solving

Pre-sales teams — AEs, SAs, CAs, and their managers — are information-rich and time-poor. Every customer conversation generates valuable intelligence: what's the customer's current stack, what pain points did they articulate, who's the decision maker, what did we promise them, what are the next steps? But that intelligence ends up scattered across individual note-taking apps, memory, and email threads.

The result:
- **AEs spend time before calls** re-reading old notes instead of preparing strategy
- **SAs take notes during meetings** instead of guiding the technical conversation
- **CAs onboard blind** to what was promised in pre-sales
- **Leaders ask for updates** in meetings that could have been a 30-second search
- **Deals fall through** because a commitment was forgotten or a follow-up slipped

---

## The Solution: Focus on the Room

With this system in place, the dynamic changes completely.

**In the meeting:** Granola captures and transcribes everything. The SA or AE focuses on listening, asking the right questions, and guiding the conversation — not writing bullet points.

**After the meeting:** The AI-generated Granola summary comes pre-populated into the pipeline UI. The team member reviews, enriches (account, tags, action items), and ingests — a two-minute task.

**Before the next meeting:** One question to the Account Intelligence Agent: *"Tell me the latest with Adobe."* In under 10 seconds: a full briefing — last meeting summary, open action items, competitive landscape, technical environment, who's who, what we promised, sentiment trend, next steps.

---

## What It Does

### For the Account Executive

- **Call prep in 10 seconds:** Ask the agent for a briefing before any customer call. Get deal stage, stakeholder map (who's the champion, who's blocking), budget/timeline signals, competitive threats, and open action items — all from actual meeting notes, not CRM fields filled in weeks ago.
- **Never miss a commitment:** The system tracks everything we promised the customer. The agent surfaces overdue items before they become relationship problems.
- **Competitive awareness:** Instantly see which vendors the account is evaluating, what differentiators resonated, and what objections were raised.
- **Deal velocity signals:** Momentum score, sentiment trend, time since last meeting — know which accounts need attention before your manager asks.

### For the Solutions Architect and Customer Architect

- **Stay in the room:** Granola handles note-taking. The SA focuses on the whiteboard conversation, asking technical questions, guiding architecture decisions — the work that actually advances the deal.
- **Technical continuity:** The full technical environment from every meeting (current stack, pain points, requirements, constraints, scale) is stored and searchable. Pick up any account, any meeting, and instantly know what's been discussed technically.
- **Commitment tracking:** Every promise made to a customer lives in the system. CAs onboarding to an account see exactly what pre-sales committed to — no surprises, no renegotiation moments.
- **POC readiness:** Demo and POC requests are captured and searchable. Never lose track of what a customer asked to see.
- **Salesforce 1-2-3 update in seconds:** Ask the agent *"Give me my 1-2-3 for this week"* and get a formatted, copy-paste-ready Salesforce update — what you did this week, what you're planning next week, and whether you have the tech win (and why) across every account. No manual write-up, no end-of-Friday scramble.

### For Leadership

- **Pipeline visibility without meetings:** Ask the agent for a pipeline overview and get meeting count, sentiment trend, momentum score, and at-risk flags across all accounts — in one response.
- **At-risk early warning:** The system automatically flags accounts with negative sentiment trends or no customer contact in 30+ days. Get ahead of problems before they become escalations.
- **Account health at a glance:** Rollup metrics per account — computed automatically from ingested notes — give leadership a real-time view of engagement quality, not just CRM stage data.
- **Cross-account patterns:** Identify which objections are showing up across multiple accounts, which competitors keep appearing, which technical requirements are driving deals.

---

## How It Works

```
Customer Meeting
      │
      ▼
 Granola (AI transcription + structured summary)
      │
      ▼
 Pipeline UI (review, enrich, tag — 2 minutes)
      │
      ├──▶ Elastic Serverless
      │         • granola-meeting-notes (full structured data + Jina embeddings)
      │         • action-items (denormalized for fast querying)
      │         • account-rollups (nightly aggregations per account)
      │         • account-alerts (overdue items, stale accounts, at-risk signals)
      │
      └──▶ Google Drive (markdown files, shared with team, readable by Claude Desktop)

                        ▼
           Account Intelligence Agent (Kibana Agent Builder)
                        │
                 Answers questions like:
                 • "Tell me the latest with Adobe"
                 • "What did we promise Acme last month?"
                 • "Which accounts are at risk?"
                 • "Build me a call prep brief for my 2pm"
                 • "What's Cisco's technical stack?"
```

### The Agent

The **Account Intelligence Agent** lives in Kibana's Agent Builder. It knows your meeting data — indices, field names, what's nested, what's rolled up. It uses ES|QL tools to query structured data fast, and built-in search tools for semantic/natural-language queries across transcripts.

It has three modes of operation, set by the persona you select:

| Persona | Focus |
|---|---|
| **AE** | Deal stage, stakeholders, competitive intel, budget/timeline, next steps |
| **SA / CA** | Technical environment, POC requests, architecture decisions, commitments |
| **Leader** | Account rollups, sentiment trends, at-risk flags, pipeline coverage |

The agent cites every source note by meeting title, date, and author — so you can always trace back to the original transcript.

---

## Quick Start

### 1. Prerequisites

- Node.js 18+
- Elastic Cloud account with an Elasticsearch Serverless project
- Granola Business or Enterprise account (for API access)
- Google Drive for Desktop (optional — for shared markdown files)

### 2. Configure

```bash
git clone https://github.com/leungsteve/AgenticMeetingNotes.git
cd AgenticMeetingNotes
npm install
cp .env.example .env
# Edit .env: add ELASTIC_CLOUD_ID and ELASTIC_API_KEY
```

### 3. Initialize

```bash
# Create all Elastic indices and update the ingest pipeline
npm run setup:elastic

# Seed lookup values (accounts, tags, meeting types)
npm run seed:lookups

# Create the Account Intelligence Agent in Kibana with all ES|QL tools
npm run setup:kibana-agent
```

### 4. Run

```bash
npm run dev
# Frontend: http://localhost:5173
# Backend API: http://localhost:3001
```

---

## The Workflow

### Team Member (AE / SA / CA)

1. **Hold the meeting** — Granola captures and transcribes automatically
2. **Open the pipeline UI** → My Notes → From Granola tab
3. **Review the AI summary** — fix any misattributions, add context
4. **Enrich** — set Account, Opportunity, Meeting Type, Tags, Action Items
5. **Click "Ingest"** — note is indexed into Elastic, markdown written to shared Drive
6. Done. The whole process takes 2–3 minutes.

### SA Weekly Salesforce Update (1-2-3)

Every SA needs to update Salesforce weekly with three things. Ask the agent:
> *"Give me my 1-2-3 for this week"*

The agent calls three tools in parallel and returns a formatted, copy-paste-ready update:

```
1. WHAT DID I DO THIS WEEK
   Adobe — 2026-04-21 — Discovery — Serverless cost estimation deep-dive with AEM team.
   Walked through swag numbers; identified consolidation scenarios. Key decision: schedule
   follow-up with refined multi-tenant model.

2. WHAT AM I PLANNING TO DO NEXT WEEK
   Adobe   — Create refined cost estimate with 3 consolidation scenarios (due Apr 28)
   Cisco   — Deliver POC architecture doc (due Apr 25) ⚠️ due in 3 days

3. DO I HAVE THE TECH WIN?
   ✅ Acme Corp    — Tech win confirmed. Customer explicitly approved Elastic in decisions_made.
   ⚠️ Adobe         — In progress. Sentiment is neutral; price gap to close; follow-up scheduled.
   ❌ GlobalBank    — Not yet. Open technical blockers around compliance; demo still pending.
```

### Before a Customer Call

Ask the Account Intelligence Agent in Kibana:
> *"Give me a call prep brief for Adobe — I have a meeting in an hour"*

Get back in seconds:
- Last 3 meeting summaries with key takeaways
- Open action items and anything overdue
- Technical environment snapshot
- Stakeholder map (decision makers, champions, blockers)
- Competitive landscape
- What we promised them and when
- Sentiment trend and momentum score

### Leadership Review

Ask the agent:
> *"Which accounts are at risk?"*
> *"Compare Adobe and Cisco — who has more momentum?"*
> *"What changed for Acme in the last 30 days?"*

---

## Elastic Indices

| Index | Purpose |
|---|---|
| `granola-meeting-notes` | Full structured meeting notes with Jina embeddings |
| `granola-sync-state` | Per-user sync state and API key storage |
| `granola-lookups` | Reference data: accounts, opportunities, tags, meeting types |
| `account-pursuit-team` | Pursuit team roster per account (AE/SA/CA) |
| `account-rollups` | Nightly per-account aggregations: sentiment, momentum, competitor set |
| `action-items` | Denormalized action items for fast agent queries |
| `agent-actions` | Audit log of every agent tool call |
| `agent-alerts` | Alerts: overdue items, stale accounts, at-risk signals |
| `agent-feedback` | Thumbs ratings on agent responses |
| `integrations-slack-users` | Slack user → email mapping (Phase 3) |

**Inference:** The ingest pipeline uses `.jina-embeddings-v3` (Elastic-managed, no external API key needed) for semantic embeddings on every summary and transcript. The agent's hybrid search uses `.jina-reranker-v2-base-multilingual` for reranking.

---

## Granola Setup

Each team member needs Granola configured with the structured meeting template. Go to **Granola Settings → Templates** and create the "Account Meeting" template from the spec in `project_brief.md`. The template structures Granola's AI output so the pipeline can extract attendees, action items, technical details, competitive intel, and more automatically.

**Why the template matters:** Without structure, the AI summary is a narrative. With the template, it's a database row — every field is predictable, every question the agent can answer is answered from the right field.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    WEB UI (React + Tailwind)              │
│  My Notes │ Team View │ Accounts │ Inbox │ Chat │ SFDC   │
└─────────────────────┬───────────────────────────────────┘
                      │ REST API
              ┌───────┴────────┐
              │ Express Backend │
              │ Port 3001       │
              └──┬──────────┬──┘
                 │          │
    ┌────────────┘          └──────────────┐
    ▼                                      ▼
Elastic Serverless                   Google Drive
  • 10 indices                        (shared markdown)
  • Jina embeddings
  • Nightly workers
  • Agent alerts

    ▼
Kibana Agent Builder
  Account Intelligence Agent
  10 ES|QL tools + 4 built-in tools
  AE / SA-CA / Leader personas
```

---

## Ops

```bash
npm run setup:elastic        # Create indices + update pipeline (idempotent)
npm run setup:kibana-agent   # Create/update Kibana agent + ES|QL tools (idempotent)
npm run seed:lookups         # Seed reference data
npm run run:rollups          # Manually trigger account rollup computation
npm run run:alerts           # Manually trigger alerts worker
npm run run:eval             # Run eval harness against gold Q&A sets
```

---

## Roadmap

| Phase | Status | What |
|---|---|---|
| 0 | ✅ Done | Elastic indices, Jina EIS inference, ingest pipeline |
| 1 | ✅ Done | Kibana Agent Builder agent, 10 ES|QL tools, UI pages, background workers |
| 2 | 🔧 Scaffold | `/chat` page with SSE proxy to Agent Builder REST API |
| 3 | 🔧 Scaffold | Slack slash command (`/intelligence`) |
| — | Planned | Salesforce live integration (currently stub — `SALESFORCE_MODE=live`) |
| — | Planned | LTR (Learning to Rank) fine-tuning on agent feedback |

---

## Team Roles

| Role | How They Use It |
|---|---|
| **AE** | Call prep briefs, deal stage tracking, competitive intel, commitment follow-up |
| **SA** | In-meeting focus, technical environment continuity, POC tracking, architecture Q&A |
| **CA** | Onboarding to accounts, commitment visibility, post-sales technical handoff |
| **Leader** | Pipeline health, at-risk flags, cross-account patterns, no-meeting needed |

---

## License

[TBD]
