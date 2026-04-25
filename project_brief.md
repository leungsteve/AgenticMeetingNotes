# Granola → Elastic Meeting Intelligence Pipeline

## Project Overview

A web application that enables pre-sales account teams (AE, SA, CA, leadership) to review, tag, and selectively ingest their Granola meeting notes into Elastic Serverless. On ingest, notes are also written as Markdown files to a local folder that is synced to a shared Google Drive via Google Drive for Desktop. Team members access these notes via Claude Desktop for AI-powered account intelligence.

**Core Philosophy:** Human-in-the-loop. Users review and enrich their notes before ingestion — better data quality, more control, and a more compelling demo for leadership.

**Prerequisite:** Google Drive for Desktop installed and configured. The app writes to a local folder; Google Drive handles the cloud sync and team sharing automatically.

---

## Granola Setup Guide

Each team member needs Granola configured before using this pipeline. This section covers initial setup, API key generation, and — critically — a meeting notes template that ensures Granola's AI output is structured for downstream ingestion.

### 1. Install & Account Setup

1. Download Granola from [granola.ai](https://granola.ai) (macOS or Windows)
2. Sign up with your work email — your admin should have a Business or Enterprise workspace
3. Grant microphone/screen permissions when prompted
4. Verify Granola is capturing audio by joining a test meeting

### 2. Generate Your API Key

1. Open Granola desktop app
2. Go to **Settings → API**
3. Click **"Create API Key"** (requires Business or Enterprise plan)
4. Copy the key — you'll enter it in the pipeline app's Settings page
5. Note: Personal API keys only access notes you own or that are shared with you

### 3. Configure Your Meeting Notes Template

Granola uses AI to generate meeting summaries from your transcript. A custom template ensures the output is structured consistently for ingestion. Go to **Settings → Templates** in Granola and create a template called **"Account Meeting"** (or set it as default):

**Recommended Template:**

```
## Attendees
List everyone present in the meeting. For each person, include as much as is known:
- [Full Name] — [Title/Role] | [Company/Org] | [Email if known]
Mark who the key decision maker is (if identifiable) with "(Decision Maker)" and who the technical champion is with "(Champion)".

## Meeting Context
- **Purpose:** [Why this meeting was scheduled — e.g., "Initial discovery call", "Follow-up on POC results", "Security review"]
- **Agenda:** [What was planned to be covered, if known]
- **Meeting Type:** [Discovery / Demo / Technical Deep-Dive / Architecture Review / Security Review / Pricing Discussion / QBR / Executive Briefing / Internal Strategy / Other]
- **Scheduled by:** [Who requested or organized this meeting]

## Meeting Summary
Provide a concise 2-3 paragraph summary of the meeting. Focus on what was discussed, key decisions made, and the overall outcome.

## Key Topics Discussed
- List the main topics covered in bullet point format
- Include any technical requirements or specifications mentioned
- Note any product/feature discussions
- Note any architecture or infrastructure discussions

## Technical Environment & Requirements
Capture any technical details discussed:
- **Current Stack:** [What tools, platforms, infrastructure the customer currently uses — e.g., "AWS, self-managed Elasticsearch 7.17, Kafka, Datadog for monitoring"]
- **Pain Points:** [Technical problems they're trying to solve]
- **Requirements:** [Specific technical requirements mentioned — e.g., "must support SAML SSO", "need sub-200ms p99 latency", "FedRAMP required"]
- **Scale:** [Data volumes, user counts, query rates, cluster sizes, or other scale indicators mentioned]
- **Integrations:** [Systems they need to integrate with]
- **Constraints:** [Technical limitations, compliance requirements, deployment restrictions — e.g., "cannot use public cloud", "data must stay in EU"]

## Decisions Made
- List any decisions reached during the meeting, with rationale if discussed
- Note who made or approved each decision
- Flag any decisions that are conditional or tentative

## Action Items
For each action item, format as:
- [ ] [Description of the action item] — **Owner:** [Person responsible] | **Due:** [Date if mentioned, otherwise "TBD"]

## Commitments Made
List any promises, commitments, or deliverables our team agreed to (distinct from action items — these are things we told the customer we would do or provide):
- [Commitment] — **By:** [Who committed] | **When:** [Timeline given, if any]

## Customer Sentiment & Objections
- **Overall Sentiment:** [Enthusiastic / Positive / Neutral / Cautious / Concerned / Skeptical]
- **Specific Concerns:** List any concerns or objections raised, with context
- **Objections:** List any direct objections to moving forward (e.g., "worried about migration complexity", "leadership not yet bought in", "budget not approved until Q3")
- **Champion Signals:** Note if anyone on the customer side is actively advocating for us, and how

## Competitive Landscape
- **Incumbent / Current Solution:** [What they are currently using and their satisfaction level]
- **Competitors Evaluating:** [Other vendors or solutions they are considering]
- **Competitive Mentions:** [Any specific competitor references — e.g., "CTO mentioned Splunk is too expensive", "evaluating Datadog as alternative"]
- **Our Differentiators Discussed:** [What resonated or was highlighted as unique to our solution]

## Budget, Timeline & Procurement
- **Budget:** [Any budget figures, ranges, or fiscal year references mentioned]
- **Timeline:** [When they need a decision, go-live, or next milestone — e.g., "need to be in production by Q3", "contract renewal in September"]
- **Procurement Process:** [Any mentions of legal review, procurement cycles, approval chains, or buying process — e.g., "need to go through security review first", "VP approval required above $100K"]
- **Deal Stage Signals:** [Anything indicating where they are in the buying process]

## Demo / POC Requests
If any demo, proof of concept, or technical evaluation was requested, describe:
- What they want to see
- Technical requirements or constraints
- Data they can provide for the POC
- Timeline expectations
- Success criteria if discussed
- Who needs to be in the demo audience

## Resources Shared or Requested
- **Shared During Meeting:** [Documents, links, slides, recordings, or references shared by either side]
- **Requested by Customer:** [Any materials, documentation, references, or follow-up information they asked for]
- **Requested by Us:** [Any data, access, or information we asked the customer to provide]

## Next Steps
- List agreed-upon next steps in order
- Include who is responsible and any mentioned timelines
- Note if a follow-up meeting was scheduled (date, time, attendees, agenda)

## Open Questions
- List any questions that were raised but not answered during the meeting
- Note who the question is directed at and who needs to provide the answer

## Tech Win Status
This section drives the Risk Tracker, Manager Dashboard, and the Friday digest. Fill in every field for any meeting tied to a real opportunity — the AI should pre-populate from the conversation; the SA confirms in the Enrich Panel.
- **Opportunity:** [The Salesforce opportunity name or `opp_id`. Required if this meeting moved a deal.]
- **Tech Status (RYG):** [Red / Yellow / Green — Red = blocker on Path to Tech Win; Yellow = at-risk or slipping; Green = on track]
- **Tech Status Reason:** [One-to-two sentences explaining the colour. Cite the specific blocker, slipped milestone, or proof point.]
- **Path to Tech Win:** [What it will take, technically, to win this deal. Two-to-four sentences. This is Kevin's #1 ask — be specific: which POC, which integration proof, which architecture decision, which security review.]
- **Next Milestone — Date:** [YYYY-MM-DD of the next concrete checkpoint]
- **Next Milestone — Description:** [What we expect to demonstrate or deliver by that date]
- **What Changed Since Last Update:** [Two-to-three sentences. New commitments, slipped dates, status flips, new blockers, new champions. Drives the manager's exception view.]
- **Help Needed:** [Be explicit about asks: "Need product to confirm SAML SSO in v9.2", "Need legal review of the on-prem deployment exception", "Need exec sponsor to attend the April 30 readout". Empty is fine if there is none.]
```

**Why this template matters:**
- **Attendees** with role/title/org feeds directly into the pipeline's `attendees` field and enables stakeholder mapping across meetings — critical for knowing who the decision makers and champions are
- **Meeting Context** helps auto-classify `meeting_type` and gives Claude Desktop the "why" behind each meeting
- **Technical Environment** is gold for SAs — this context carries across meetings, so Claude can answer "what is Aurora Health Systems' current stack?" without re-reading every transcript
- **Decisions Made** creates an auditable record of what was agreed — leadership can track deal progression without attending meetings
- **Action Items** with Owner/Due format maps directly to the pipeline's `action_items` field and is parseable by the ingestion UI
- **Commitments Made** (separate from action items) tracks what we promised the customer — essential for accountability and follow-through
- **Customer Sentiment & Objections** helps leadership gauge account health; Objections specifically help the AE prepare counterpoints
- **Competitive Landscape** auto-triggers the "competitive" tag in the ingest pipeline and builds a picture of the competitive situation over time
- **Budget, Timeline & Procurement** auto-triggers "pricing" and "timeline" tags; gives the AE and leadership critical deal qualification data
- **Demo / POC Requests** surfaces work for the SA immediately, auto-triggers "demo-request" tag
- **Resources Shared or Requested** prevents the "I think we sent them that already" problem — queryable across all meetings
- **Open Questions** ensures nothing falls through the cracks between meetings
- **Tech Win Status** is the spine of Ed's manager view, the Risk Tracker, and the Friday digest. Tech Status (RYG) and Path to Tech Win answer Kevin's two questions. What Changed enables exception-based reviews instead of opening every note. Help Needed converts an SA's local frustration into a manager-actionable ask.
- Consistent structure means Claude Desktop gives better answers when querying across meetings

### Data Source Note: Opportunity Spine

Opportunity-level fields (account, opp name, ACV, close quarter, forecast category, sales stage, owner SE, owner AE, manager, account tier) live in Salesforce and Clari. **The pipeline does not have API access to either today.**

For the MVP they are sourced from `data/opportunities.csv` checked into the repo and loaded into the `opportunities` Elastic index via `npm run seed:opportunities`. The Enrich Panel's Tech Win section reads the opportunity dropdown from that index, and the Risk Tracker / Manager Dashboard / Friday digest all join meeting-derived signals to the spine through `opp_id`. When Salesforce + Clari APIs are granted we replace the CSV loader with a poller that writes the same index — UI and template are unchanged. See [docs/data-sources.md](docs/data-sources.md) for the full ADR.

### 4. Meeting Workflow Tips

- **Start Granola before the meeting** — it needs to be running to capture audio
- **Use the "Account Meeting" template** for all customer-facing meetings
- **Add quick manual notes during the meeting** — Granola combines your typed notes with the AI transcript
- **Review the AI summary within an hour** while context is fresh — fix any misattributions or missed nuances
- **Tag attendees** in Granola if prompted — this helps with attendee extraction in the pipeline

### 5. Template for Internal Meetings

For internal account team meetings (pipeline reviews, deal strategy, etc.), use a focused template:

```
## Attendees
- [Name] — [Role] (e.g., AE, SA, CA, SA Manager, Sales Director)

## Meeting Context
- **Purpose:** [Pipeline review / Deal strategy / Account planning / Escalation / Handoff / Other]
- **Account(s) Discussed:** [Which account(s) or opportunity(ies) were covered]

## Discussion Summary
Concise summary of what was discussed.

## Account Status Updates
For each account or opportunity discussed:
- **Account/Opportunity:** [Name]
- **Current Stage:** [Where it is in the pipeline]
- **Update:** [What changed since last discussion]
- **Blockers:** [What is preventing progress]

## Decisions Made
- List any decisions with rationale
- Note who made the decision and any conditions

## Strategy & Approach
- What approach or strategy was agreed upon for the account
- Any changes to the engagement plan (new stakeholders to target, different messaging, escalation path)

## Action Items
- [ ] [Description] — **Owner:** [Person] | **Due:** [Date or TBD]

## Risks & Concerns
- Note any risks to the deal, timeline, or relationship discussed
- Include likelihood and impact if discussed
- Note any mitigation plans

## Resource Needs
- Any requests for additional support (executive sponsor, specialist SE, legal, etc.)
- Any internal escalations needed

## Next Internal Sync
Date and agenda items for the next internal meeting if discussed.
```

When ingesting internal meetings, tag them with `meeting_type: "internal"` — they'll be stored in Elastic but can be filtered out of customer-facing views.

---

## Elastic Serverless Setup Guide

This section walks you through creating an Elastic Serverless project and obtaining the credentials needed to run the pipeline app. **Do this before running the app or setup scripts.**

### 1. Create an Elastic Serverless Project

1. Go to [cloud.elastic.co](https://cloud.elastic.co) and log in (or sign up for a free trial)
2. Click **"Create project"**
3. Select **"Elasticsearch"** as the project type (not Observability or Security)
4. Choose a name: e.g., `meeting-intelligence` or `granola-pipeline`
5. Select your preferred cloud provider and region (choose a region close to your team)
6. Click **"Create project"**
7. Wait for the project to be provisioned (usually 1-2 minutes)

### 2. Get Your Cloud ID

1. Once the project is created, go to the project's **Overview** or **Management** page
2. Find the **Cloud ID** — it looks like: `meeting-intelligence:dXMtY2VudHJhbDEuZ2NwLmNsb3VkLmVzLmlvJGFiY2...`
3. Copy this value — it encodes both the Elasticsearch and Kibana endpoints

### 3. Create an API Key

1. In your Serverless project, navigate to **Management → API keys** (or use the Dev Tools console)
2. Click **"Create API key"**
3. Name it: `granola-pipeline-app`
4. Set the role/privileges — for Phase 1, use unrestricted access. For production, scope it to:
   ```json
   {
     "role_descriptors": {
       "granola_pipeline": {
         "indices": [
           {
             "names": ["granola-meeting-notes", "granola-sync-state", "granola-lookups"],
             "privileges": ["all"]
           }
         ],
         "cluster": ["monitor", "manage_ingest_pipelines", "manage_ml"]
       }
     }
   }
   ```
5. Click **"Create API key"**
6. **Copy the encoded API key immediately** — it is only shown once. It looks like: `bWVldGluZy1pbnRlbGxpZ2VuY2U6YWJjZGVmZzEyMzQ1Ng==`

### 4. Configure Your .env File

Create a `.env` file in the project root (copy from `.env.example`):

```env
# Elastic Serverless — obtained from steps above
ELASTIC_CLOUD_ID=meeting-intelligence:dXMtY2VudHJhbDEuZ2NwLmNsb3VkLmVzLmlvJGFiY2...
ELASTIC_API_KEY=bWVldGluZy1pbnRlbGxpZ2VuY2U6YWJjZGVmZzEyMzQ1Ng==

# Local Google Drive path (where Shared Drive is mounted)
DRIVE_NOTES_PATH=/Users/jane/Library/CloudStorage/GoogleDrive-jane@elastic.co/Shared drives/Account Teams
```

**Security note:** The `.env` file contains secrets. It is in `.gitignore` and should never be committed. Each developer creates their own `.env` from `.env.example`.

### 5. Run the Setup Scripts

Once your `.env` is configured, run the setup scripts to create the indices and ingest pipeline:

```bash
# Install dependencies
npm install

# Create indices, mappings, and ingest pipeline in your Serverless project
npm run setup:elastic

# Seed the lookups index with default values (accounts, meeting types, tags, etc.)
npm run seed:lookups
```

The setup script is idempotent — safe to run multiple times. It will skip indices that already exist.

### 6. Verify the Connection

After setup, verify everything is working:

```bash
# Start the app
npm run dev

# The app header should show a green dot next to "Elastic" indicating a successful connection
# Navigate to Settings → Elastic Connection to see the Cloud ID and status
```

If you see a red dot or "Cannot connect to Elastic" banner:
- Verify your `ELASTIC_CLOUD_ID` and `ELASTIC_API_KEY` in `.env`
- Make sure the Serverless project is active (not paused due to inactivity)
- Check that your API key has the required privileges

### 7. Deploy the Semantic Model (for vector search)

The ingest pipeline uses Elastic's built-in `.multilingual-e5-small` model for generating embeddings. On Elastic Serverless, this model is pre-deployed and available. If you see errors about the model not being found:

1. Go to **Machine Learning → Trained Models** in Kibana
2. Find `.multilingual-e5-small` and ensure it is deployed
3. If not available, you can use `.elser_model_2` as an alternative (update the `model_id` in the ingest pipeline config)

---

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                        WEB UI (React)                          │
│                                                                │
│  ┌──────────┐   ┌──────────────┐   ┌────────────────────────┐ │
│  │ Note List │──▶│ Note Preview │──▶│ Tag & Enrich Panel     │ │
│  │ (per user)│   │ + Transcript │   │ - Account              │ │
│  │           │   │              │   │ - Opportunity           │ │
│  │ [✓] Note1 │   │              │   │ - Meeting Type          │ │
│  │ [✓] Note2 │   │              │   │ - Tags (multi-select)   │ │
│  │ [ ] Note3 │   │              │   │ - Action Items (edit)   │ │
│  └──────────┘   └──────────────┘   │                        │ │
│                                     │ [ Ingest Selected → ]  │ │
│                                     └────────────────────────┘ │
└───────────────────────────┬────────────────────────────────────┘
                            │ POST /api/ingest
                            ▼
┌────────────────────────────────────────────────────────────────┐
│                     BACKEND (Node.js / Express)                │
│                                                                │
│  /api/notes          → Proxy to Granola API (per-user keys)   │
│  /api/notes/:id      → Fetch single note + transcript         │
│  /api/ingested       → Query ingested notes from Elastic      │
│  /api/ingested/:id   → Get single ingested note with history  │
│  /api/ingest         → Write to Elastic + local Drive folder   │
│  /api/team-members   → List configured team members            │
│  /api/sync-status    → Show what's been ingested already       │
│  /api/lookups        → Accounts, opportunities, tag options    │
└───────────┬───────────────────────┬────────────────────────────┘
            │                       │
            ▼                       ▼
┌───────────────────┐   ┌───────────────────────────────────┐
│ ELASTIC SERVERLESS│   │  LOCAL FILESYSTEM                  │
│                   │   │  (Google Drive for Desktop folder) │
│ granola-notes     │   │                                   │
│ granola-sync-state│   │  ~/Google Drive/Shared Drives/    │
│ granola-lookups   │   │    Account Teams/                 │
│                   │   │      Aurora Health Systems/...    │
│ Ingest Pipeline   │   │        2026-04-21 - Discovery.md  │
│ (enrich + embed)  │   │                                   │
└───────────────────┘   └──────────────┬────────────────────┘
                                       │
                          Google Drive for Desktop auto-syncs
                          to shared Google Drive (cloud)
                                       │
                          All team members see the same folder
                          via their own Google Drive for Desktop
                                       │
                                       ▼
                        ┌─────────────────────────┐
                        │ CLAUDE DESKTOP / PROJECT │
                        │ Reads from local Drive   │
                        │ folder as project context │
                        └─────────────────────────┘
```

**Why this is simpler:**
- No Google Drive API, no service accounts, no OAuth, no googleapis dependency
- No async sync tracking (`synced_to_drive`, `drive_file_id` fields eliminated)
- Writing a `.md` file to a local folder is a single `fs.writeFile()` call
- Google Drive for Desktop handles sync, conflict resolution, and sharing
- Every team member with access to the Shared Drive sees the files automatically

---

## Elastic Serverless Setup

### One Project, Three Indices

Use a single Elastic Serverless project (Elasticsearch type).

#### Index 1: `granola-meeting-notes` (primary data store)

```json
{
  "mappings": {
    "properties": {
      "note_id":            { "type": "keyword" },
      "meeting_group_id":   { "type": "keyword" },

      "account":            { "type": "keyword" },
      "opportunity":        { "type": "keyword" },
      "team":               { "type": "keyword" },

      "author_email":       { "type": "keyword" },
      "author_name":        { "type": "keyword" },
      "author_role":        { "type": "keyword" },

      "attendees": {
        "type": "nested",
        "properties": {
          "name":           { "type": "text", "fields": { "keyword": { "type": "keyword" } } },
          "title":          { "type": "text" },
          "company":        { "type": "keyword" },
          "email":          { "type": "keyword" },
          "role_flag":      { "type": "keyword" }
        }
      },
      "attendee_names":     { "type": "keyword" },

      "meeting_date":       { "type": "date" },
      "ingested_at":        { "type": "date" },
      "ingested_by":        { "type": "keyword" },

      "meeting_purpose":    { "type": "text" },
      "scheduled_by":       { "type": "keyword" },

      "title":              { "type": "text", "fields": { "keyword": { "type": "keyword" } } },
      "summary":            { "type": "text" },
      "transcript":         { "type": "text" },
      "key_topics":         { "type": "text" },
      "decisions_made":     { "type": "text" },
      "open_questions":     { "type": "text" },

      "technical_environment": {
        "type": "object",
        "properties": {
          "current_stack":  { "type": "text" },
          "pain_points":    { "type": "text" },
          "requirements":   { "type": "text" },
          "scale":          { "type": "text" },
          "integrations":   { "type": "text" },
          "constraints":    { "type": "text" }
        }
      },

      "action_items": {
        "type": "nested",
        "properties": {
          "description":    { "type": "text" },
          "owner":          { "type": "keyword" },
          "due_date":       { "type": "date" },
          "status":         { "type": "keyword" }
        }
      },

      "commitments": {
        "type": "nested",
        "properties": {
          "description":    { "type": "text" },
          "committed_by":   { "type": "keyword" },
          "timeline":       { "type": "text" }
        }
      },

      "customer_sentiment": {
        "type": "object",
        "properties": {
          "overall":        { "type": "keyword" },
          "concerns":       { "type": "text" },
          "objections":     { "type": "text" },
          "champion_signals": { "type": "text" }
        }
      },

      "competitive_landscape": {
        "type": "object",
        "properties": {
          "incumbent":      { "type": "text" },
          "competitors_evaluating": { "type": "keyword" },
          "mentions":       { "type": "text" },
          "differentiators": { "type": "text" }
        }
      },

      "budget_timeline": {
        "type": "object",
        "properties": {
          "budget":         { "type": "text" },
          "timeline":       { "type": "text" },
          "procurement":    { "type": "text" },
          "stage_signals":  { "type": "text" }
        }
      },

      "demo_poc_request": {
        "type": "object",
        "properties": {
          "description":    { "type": "text" },
          "requirements":   { "type": "text" },
          "data_available": { "type": "text" },
          "timeline":       { "type": "text" },
          "success_criteria": { "type": "text" },
          "audience":       { "type": "text" }
        }
      },

      "resources_shared":   { "type": "text" },
      "resources_requested_by_customer": { "type": "text" },
      "resources_requested_by_us":       { "type": "text" },

      "next_meeting": {
        "type": "object",
        "properties": {
          "date":           { "type": "date" },
          "agenda":         { "type": "text" },
          "attendees":      { "type": "keyword" }
        }
      },

      "tags":               { "type": "keyword" },
      "meeting_type":       { "type": "keyword" },
      "sales_stage":        { "type": "keyword" },

      "summary_embedding":  { "type": "dense_vector", "dims": 384 },

      "local_file_path":    { "type": "keyword" },

      "version":            { "type": "integer" },
      "updated_at":         { "type": "date" },
      "update_history": {
        "type": "nested",
        "properties": {
          "updated_at":     { "type": "date" },
          "updated_by":     { "type": "keyword" },
          "changes":        { "type": "text" }
        }
      }
    }
  }
}
```

Notes:
- `attendees` is a nested type with structured fields (name, title, company, email, role_flag). `role_flag` captures "decision_maker", "champion", "technical_evaluator", etc. `attendee_names` is a flattened keyword array for simple filtering (e.g., "show me all meetings with Bob Smith").
- `technical_environment` captures the customer's stack, pain points, requirements, and constraints. This accumulates across meetings — Claude Desktop can answer "what is Aurora Health Systems' current stack?" by searching across all notes.
- `commitments` (nested) tracks promises we made to the customer, separate from action items. Critical for accountability.
- `customer_sentiment` captures both the overall tone and specific objections/champion signals. `overall` is a keyword for easy dashboard aggregation (e.g., pie chart of sentiment over time).
- `competitive_landscape` tracks incumbent solutions, who else they're evaluating, and what differentiators resonated. `competitors_evaluating` is a keyword array for faceted filtering.
- `budget_timeline` captures deal qualification signals. Auto-triggers "pricing" and "timeline" tags.
- `demo_poc_request` captures structured demo/POC details including success criteria and audience.
- `next_meeting` captures follow-up scheduling so the team can see upcoming commitments.
- `local_file_path` stores the relative path within the Drive folder for reference and dedup.
- `version` starts at 1 on first ingest and increments on each re-ingestion. `updated_at` and `update_history` track what changed and who changed it.

#### Index 2: `granola-sync-state` (per-user sync tracking)

```json
{
  "mappings": {
    "properties": {
      "user_email":           { "type": "keyword" },
      "user_name":            { "type": "keyword" },
      "user_role":            { "type": "keyword" },
      "last_fetched_at":      { "type": "date" },
      "last_fetched_cursor":  { "type": "keyword" },
      "total_notes_fetched":  { "type": "integer" },
      "total_notes_ingested": { "type": "integer" }
    }
  }
}
```

#### Index 3: `granola-lookups` (reference data for UI dropdowns)

```json
{
  "mappings": {
    "properties": {
      "type":        { "type": "keyword" },
      "value":       { "type": "keyword" },
      "label":       { "type": "text" },
      "metadata":    { "type": "object", "enabled": false }
    }
  }
}
```

Populated with:
- `type: "account"` → "Aurora Health Systems", "Helix Robotics", "Lattice Insurance", etc. (all fictitious; see `data/opportunities.csv` and `scripts/seed-lookups.ts`)
- `type: "opportunity"` → "AURORA-SEC-2026Q2", "HELIX-PLAT-2026Q1", etc.
- `type: "meeting_type"` → "discovery", "demo", "technical-review", "pricing", "internal", "qbr"
- `type: "tag"` → "demo-request", "pricing", "security", "competitive", "timeline", "escalation", "action-required", "migration", "technical", "has-objections", "has-commitments", "has-open-questions", "follow-up-scheduled"
- `type: "sales_stage"` → "prospecting", "qualification", "demo", "poc", "negotiation", "closed-won", "closed-lost"

---

### Ingest Pipeline: `granola-notes-pipeline`

Applied automatically when documents are indexed into `granola-meeting-notes`.

```json
{
  "description": "Enrich and embed Granola meeting notes on ingest",
  "processors": [
    {
      "set": {
        "field": "ingested_at",
        "value": "{{_ingest.timestamp}}"
      }
    },
    {
      "script": {
        "description": "Auto-suggest tags based on summary content",
        "source": "def autoTags = []; def s = (ctx.summary?.toLowerCase() ?: '') + ' ' + (ctx.key_topics?.toLowerCase() ?: '') + ' ' + (ctx.decisions_made?.toLowerCase() ?: ''); if (s.contains('demo') || s.contains('proof of concept') || s.contains('poc')) autoTags.add('demo-request'); if (s.contains('pricing') || s.contains('cost') || s.contains('budget') || s.contains('license') || ctx.budget_timeline?.budget != null) autoTags.add('pricing'); if (s.contains('security') || s.contains('compliance') || s.contains('soc2') || s.contains('fedramp') || s.contains('hipaa') || s.contains('gdpr') || s.contains('pci')) autoTags.add('security'); if (s.contains('competitor') || s.contains('splunk') || s.contains('datadog') || s.contains('opensearch') || s.contains('sumo logic') || s.contains('new relic') || s.contains('dynatrace') || ctx.competitive_landscape?.competitors_evaluating?.size() > 0) autoTags.add('competitive'); if (s.contains('deadline') || s.contains('timeline') || s.contains('by end of') || s.contains('go-live') || s.contains('renewal') || ctx.budget_timeline?.timeline != null) autoTags.add('timeline'); if (s.contains('blocker') || s.contains('escalat') || s.contains('urgent') || s.contains('critical')) autoTags.add('escalation'); if (s.contains('migration') || s.contains('migrate') || s.contains('cut-over') || s.contains('cutover')) autoTags.add('migration'); if (s.contains('architecture') || s.contains('design review') || s.contains('technical deep') || ctx.technical_environment?.current_stack != null) autoTags.add('technical'); if (ctx.customer_sentiment?.objections != null && ctx.customer_sentiment.objections.length() > 0) autoTags.add('has-objections'); if (ctx.commitments != null && ctx.commitments.size() > 0) autoTags.add('has-commitments'); if (ctx.demo_poc_request?.description != null) autoTags.add('demo-request'); if (ctx.open_questions != null && ctx.open_questions.length() > 10) autoTags.add('has-open-questions'); if (ctx.next_meeting?.date != null) autoTags.add('follow-up-scheduled'); if (ctx.tags == null) ctx.tags = []; for (t in autoTags) { if (!ctx.tags.contains(t)) ctx.tags.add(t); } ctx._auto_suggested_tags = autoTags;"
      }
    },
    {
      "inference": {
        "model_id": ".multilingual-e5-small",
        "input_output": [
          { "input_field": "summary", "output_field": "summary_embedding" }
        ]
      }
    }
  ]
}
```

---

## Google Drive for Desktop — Setup Requirements

### Prerequisite Configuration

Each team member needs:
1. **Google Drive for Desktop** installed (macOS or Windows)
2. Access to a **Shared Drive** (e.g., "Account Teams") — created by the team admin
3. The Shared Drive appears locally at:
   - **macOS:** `~/Library/CloudStorage/GoogleDrive-{email}/Shared drives/Account Teams/`
   - **Windows:** `G:\Shared drives\Account Teams\` (drive letter may vary)

### Folder Structure (created automatically by the app)

```
Account Teams/                          ← Shared Drive root
  └── Aurora Health Systems/            ← per-account folder (fictitious example)
      └── Meeting Notes/                ← all notes for this account
          ├── 2026-04-21 - Technical Discovery (SA - Jane).md
          ├── 2026-04-21 - Technical Discovery (AE - Mike).md
          ├── 2026-04-18 - Pricing Review (AE - Mike).md
          └── 2026-04-15 - QBR Prep (CA - Sarah).md
```

### App Configuration

The app needs ONE environment variable for the Drive path:

```env
DRIVE_NOTES_PATH=/Users/jane/Library/CloudStorage/GoogleDrive-jane@elastic.co/Shared drives/Account Teams
```

The app writes files to `{DRIVE_NOTES_PATH}/{account}/Meeting Notes/{filename}.md`. Google Drive for Desktop syncs them to the cloud. Done.

### Claude Desktop Integration

Each team member configures their Claude Desktop project to include the local Drive folder as context:
- Add the local `Account Teams/` folder (or a specific account subfolder) as a project knowledge source
- Claude can then answer questions across all ingested meeting notes
- When new notes are ingested by any team member, they appear in everyone's local Drive within minutes, and Claude sees them on next query

---

## UI Application Specification

### Tech Stack
- **Frontend:** React + TypeScript + Tailwind CSS
- **Backend:** Node.js + Express (TypeScript)
- **Elastic Client:** @elastic/elasticsearch (official Node.js client)
- **File Output:** Node.js `fs` module (write Markdown to local Drive folder)
- **Granola:** Direct REST API calls (no SDK)

### Environment Variables

```env
# Elastic Serverless
ELASTIC_CLOUD_ID=your-deployment-cloud-id
ELASTIC_API_KEY=your-api-key

# Local Google Drive path (where Shared Drive is mounted)
DRIVE_NOTES_PATH=/Users/jane/Library/CloudStorage/GoogleDrive-jane@elastic.co/Shared drives/Account Teams

# Granola API keys are stored per-user in the granola-sync-state index
# or passed from the UI per session
```

### Pages & Views

#### 1. Home / Dashboard
- Shows team overview: who has unreviewed notes, how many notes ingested this week
- Quick stats: total meetings, open action items, notes pending review
- Links to each team member's note queue

#### 2. My Notes (per-user note queue)
This is the primary workflow screen.

**Left Panel — Note List:**
- **Two source tabs at the top: "From Granola" and "In Elastic"**
  - **"From Granola" tab** (default): Fetches from Granola API using the logged-in user's API key. Shows all notes, with already-ingested notes visually distinguished (green checkmark badge, slightly muted). Already-ingested notes are still selectable — clicking one loads the Elastic version with its current metadata into the Enrich panel for editing/re-ingestion.
  - **"In Elastic" tab**: Fetches directly from the `granola-meeting-notes` index. Shows only ingested notes with their full metadata (account, tags, meeting type visible as compact pills). Filterable by account, opportunity, tags, meeting type. Useful for browsing, searching, and updating existing notes.
- Shows: title, date, attendee count, duration
- Checkbox selection for batch operations
- Filter: date range, account (In Elastic tab), already-ingested toggle (From Granola tab)
- Badge indicators:
  - Green checkmark: already ingested
  - Orange dot: ingested but metadata incomplete (no account or no tags)
  - Blue "v2", "v3": re-ingested with version number

**Center Panel — Note Preview:**
- Selected note's AI-generated summary
- Expandable transcript section
- Detected attendees list
- Auto-extracted action items (editable)
- **If viewing an already-ingested note:** shows a banner at the top: "Ingested on {date} by {user} (version {n})" with current metadata displayed. The Enrich panel pre-fills with the existing metadata so the user can edit and re-ingest.

**Right Panel — Enrich & Tag:**

The Enrich panel is scrollable and organized into collapsible sections. Required fields are at the top; optional structured sections follow. Sections that have data (parsed from the Granola note or pre-filled from an existing Elastic doc) are expanded by default; empty sections are collapsed.

*Classification (always visible):*
- **Account** — dropdown from `granola-lookups` (type: account), with "add new" option
- **Opportunity** — dropdown filtered by selected account, with "add new" option
- **Meeting Type** — dropdown: discovery, demo, technical-review, pricing, internal, qbr
- **Sales Stage** — dropdown: prospecting, qualification, demo, poc, negotiation, closed-won, closed-lost
- **Meeting Purpose** — free-text (pre-filled from Granola template if captured)
- **Tags** — multi-select chips from `granola-lookups` (type: tag), plus free-text add
- **Auto-suggested tags** — shown as dimmed/suggested chips based on content analysis; user clicks to confirm

*Attendees (collapsible):*
- Editable table/list of attendees. Each row: Name, Title, Company, Email, Role Flag (dropdown: decision_maker, champion, technical_evaluator, executive_sponsor, end_user, none)
- Pre-filled from Granola note's attendee section; user can add/remove/edit
- "Add Attendee" button at the bottom

*Action Items (collapsible):*
- Editable list, each with: description, owner (dropdown of team members), due date, status (open/done)
- User can add/remove/edit items

*Commitments (collapsible):*
- Editable list: description, committed_by (dropdown of team members), timeline (free text)
- These are promises we made to the customer — distinct from action items

*Technical Environment (collapsible):*
- Six text fields: Current Stack, Pain Points, Requirements, Scale, Integrations, Constraints
- Pre-filled from Granola template if captured; user can edit

*Customer Sentiment (collapsible):*
- Overall: dropdown (enthusiastic, positive, neutral, cautious, concerned, skeptical)
- Concerns, Objections, Champion Signals: free-text fields

*Competitive Landscape (collapsible):*
- Incumbent: free-text
- Competitors Evaluating: multi-select chips (free-text entry, builds up over time)
- Mentions: free-text
- Our Differentiators: free-text

*Budget, Timeline & Procurement (collapsible):*
- Budget, Timeline, Procurement, Stage Signals: free-text fields

*Demo / POC Request (collapsible):*
- Description, Requirements, Data Available, Timeline, Success Criteria, Audience: free-text fields

*Resources (collapsible):*
- Shared, Requested by Customer, Requested by Us: free-text fields

*Next Meeting (collapsible):*
- Date (date picker), Agenda (free text), Attendees (multi-select from team + free text)

*Open Questions (collapsible):*
- Free-text area

**Bottom Bar — Actions:**
- **"Ingest Selected"** button (primary CTA) — ingests all checked notes with their tags/metadata into Elastic and writes .md files to the local Drive folder. For new notes, this creates a new Elastic document (version 1). For already-ingested notes, this updates the existing document (increments version, records changes in update_history).
- **"Save Draft"** — saves tagging without ingesting (stores in localStorage or a drafts index)
- **"Skip"** — marks a note as reviewed-but-not-ingested (e.g., internal-only notes you don't want in the system)
- Progress indicator during ingestion
- **Button label changes contextually:** "Ingest Selected" for new notes, "Update Selected" when all selected notes are already ingested, "Ingest & Update" when selection is mixed

#### 3. Team View (for leadership / AE)
This is the primary view for browsing all ingested notes stored in Elastic.
- Shows all ingested notes across the team, fetched from the `granola-meeting-notes` index
- Filterable by: account, opportunity, author, author_role, meeting type, tags, sales stage, date range
- Search box with both keyword and semantic search (queries Elastic)
- Timeline view of account activity
- "Open Action Items" filtered view with aging indicators
- Each note row shows: title, date, author (with role badge), account, tags (as pills), version indicator
- Click a row to expand inline: full summary, action items, attendees, transcript (collapsed)
- **"Edit & Re-ingest" button** on each expanded note — navigates to My Notes with this note loaded in the Enrich panel, pre-filled with current metadata for editing

#### 4. Settings
- Add/remove team members (name, email, role, Granola API key — stored encrypted)
- Configure accounts and opportunities (manage the lookups index)
- **Drive folder path** configuration (validate the path exists on save)
- Elastic connection settings

### UI Behavior Details

**Ingestion Flow (when user clicks "Ingest Selected"):**

```
1. UI sends POST /api/ingest with:
   {
     notes: [
       {
         granola_note_id: "abc123",
         title: "Technical Discovery with Aurora Health Systems Search Team",
         summary: "...",
         transcript: "...",
         meeting_date: "2026-04-21T14:00:00Z",
         attendees: ["jane@elastic.co", "bob@aurorahealth.example"],
         author_email: "jane@elastic.co",
         author_name: "Jane Smith",
         author_role: "SA",
         // User-provided enrichment:
         account: "Aurora Health Systems",
         opportunity: "AURORA-SEC-2026Q2",
         meeting_type: "discovery",
         sales_stage: "qualification",
         tags: ["demo-request", "security", "timeline"],
         action_items: [
           { description: "Send SOC2 report", owner: "jane@elastic.co", due_date: "2026-04-25", status: "open" },
           { description: "Schedule follow-up demo", owner: "mike@elastic.co", due_date: "2026-04-28", status: "open" }
         ]
       }
     ]
   }

2. Backend for EACH note:
   a. Check if note_id already exists in Elastic
      - NEW NOTE: index into Elastic with version: 1
      - RE-INGEST: update the existing document — increment version, set updated_at,
        append to update_history with { updated_at, updated_by, changes: "summary of what changed" },
        merge new tags with existing (don't lose old tags unless explicitly removed)
   b. Ingest pipeline auto-adds: ingested_at (only on first ingest), auto-suggested tags, embedding
   c. Write Markdown file to local Drive folder:
      - Path: {DRIVE_NOTES_PATH}/{account}/Meeting Notes/{filename}.md
      - Filename: {YYYY-MM-DD} - {title} ({author_role} - {author_name}).md
      - Create account and Meeting Notes subdirectories if they don't exist (fs.mkdirSync recursive)
      - Content: formatted markdown (see format below)
      - On re-ingest: overwrite the existing .md file with updated metadata
      - If the account changed (note moved to different account folder): delete old file, write new one
   d. Update Elastic doc with local_file_path (relative path within Drive)
   e. Update granola-sync-state for this user

3. UI shows success/failure per note with:
   - Confirmation that note was indexed to Elastic (new) or updated (re-ingest with version number)
   - Local file path where the .md was written
   - Google Drive will auto-sync within ~5 minutes
```

**Re-ingestion vs. Duplicate Detection:**
- Before ingesting, backend checks if `note_id` already exists in Elastic
- If it exists: this is a **re-ingest** (update). The backend updates the existing document rather than rejecting it. The version is incremented, update_history is appended, and the .md file is overwritten.
- If two team members attended the same meeting (different note_ids):
  - Match on `meeting_date` within ±15 min AND overlapping `attendees`
  - Auto-assign a shared `meeting_group_id`
  - UI shows a "Related notes from your team" indicator

**Markdown File Format (written to Drive folder):**

```markdown
# {title}
**Date:** {meeting_date}
**Author:** {author_name} ({author_role})
**Account:** {account}
**Opportunity:** {opportunity}
**Meeting Type:** {meeting_type}
**Purpose:** {meeting_purpose}
**Tags:** {tags joined by comma}
**Version:** {version} | **Ingested:** {ingested_at}

---

## Attendees
{for each attendee:}
- {name} — {title} | {company} | {email} {role_flag if set, e.g., "(Decision Maker)"}

## Summary
{summary}

## Key Topics
{key_topics}

## Decisions Made
{decisions_made}

## Technical Environment
- **Current Stack:** {technical_environment.current_stack}
- **Pain Points:** {technical_environment.pain_points}
- **Requirements:** {technical_environment.requirements}
- **Scale:** {technical_environment.scale}
- **Integrations:** {technical_environment.integrations}
- **Constraints:** {technical_environment.constraints}
{omit section if all fields are empty}

## Action Items
- [ ] {description} — **Owner:** {owner} | **Due:** {due_date} | **Status:** {status}

## Commitments Made
- {description} — **By:** {committed_by} | **When:** {timeline}
{omit section if empty}

## Customer Sentiment
- **Overall:** {customer_sentiment.overall}
- **Concerns:** {customer_sentiment.concerns}
- **Objections:** {customer_sentiment.objections}
- **Champion Signals:** {customer_sentiment.champion_signals}
{omit section if all fields are empty}

## Competitive Landscape
- **Incumbent:** {competitive_landscape.incumbent}
- **Evaluating:** {competitive_landscape.competitors_evaluating joined by comma}
- **Mentions:** {competitive_landscape.mentions}
- **Our Differentiators:** {competitive_landscape.differentiators}
{omit section if all fields are empty}

## Budget, Timeline & Procurement
- **Budget:** {budget_timeline.budget}
- **Timeline:** {budget_timeline.timeline}
- **Procurement:** {budget_timeline.procurement}
- **Stage Signals:** {budget_timeline.stage_signals}
{omit section if all fields are empty}

## Demo / POC Request
- **Description:** {demo_poc_request.description}
- **Requirements:** {demo_poc_request.requirements}
- **Data Available:** {demo_poc_request.data_available}
- **Timeline:** {demo_poc_request.timeline}
- **Success Criteria:** {demo_poc_request.success_criteria}
- **Audience:** {demo_poc_request.audience}
{omit section if all fields are empty}

## Resources
- **Shared:** {resources_shared}
- **Requested by Customer:** {resources_requested_by_customer}
- **Requested by Us:** {resources_requested_by_us}
{omit section if all fields are empty}

## Open Questions
{open_questions}
{omit section if empty}

## Next Steps / Follow-Up
{next_steps text}
{if next_meeting.date:}
**Next Meeting:** {next_meeting.date} — {next_meeting.agenda}

---

## Transcript
{transcript}
```

Note: Sections with no data should be omitted entirely from the .md file to keep it clean and readable. The file-writer service should check each section and skip empty ones.

---

## Edge Cases & Handling

| Scenario | Handling |
|----------|---------|
| Note still processing in Granola | Granola API excludes it. UI shows "X notes still processing" if recent meetings have no notes yet. |
| User has no Granola API key configured | Settings page prompts them. Other team members' notes are still visible in Team View. |
| Granola rate limit hit (429) | Backend retries with exponential backoff (max 3 retries). UI shows "Rate limited, retrying..." |
| DRIVE_NOTES_PATH doesn't exist | Settings page validates path on save. Ingest shows clear error: "Drive folder not found. Is Google Drive for Desktop running?" |
| Google Drive for Desktop not running | Files are written locally. They'll sync when Drive starts. No error — this is fine. |
| Drive folder permissions issue | Backend catches EACCES on fs.writeFile, returns clear error to UI. |
| Filename collision (same title, same date, same author) | Append note_id suffix: `2026-04-21 - Discovery (SA - Jane) [abc123].md` |
| Very long transcript (>50K chars) | Store full transcript in both Elastic and the .md file. The .md is a local file — no size limits to worry about. |
| Re-ingestion (same note_id) | Backend updates existing doc: increments version, appends update_history, overwrites .md file. UI shows "Updated (v{n})" confirmation. |
| Re-ingest with account change | Old .md file is deleted from previous account folder, new file written to new account folder. Elastic doc updated with new local_file_path. |
| Re-ingest by different team member | Allowed. update_history records who made the change. Original author_email/name unchanged; updated_by tracks the editor. |
| Team member leaves | Admin removes from Settings. Their ingested notes remain in Elastic and Drive. Granola key is revoked. |
| New opportunity created mid-conversation | "Add new" option in opportunity dropdown. Saves to `granola-lookups` index immediately. |
| Offline / Elastic unreachable | Write .md file locally anyway (it'll sync via Drive). Queue Elastic write in localStorage. Show "Saved to Drive. Elastic sync pending." |
| Meeting with no clear account | Allow "account: unassigned" — files go to `{DRIVE_NOTES_PATH}/Unassigned/Meeting Notes/`. Surface in "needs triage" dashboard view. |
| Special characters in title | Sanitize filename: replace `/\:*?"<>|` with `-`, trim to 200 chars max. |
| Two users ingest same meeting simultaneously | Elastic dedup catches via note_id. Drive files are per-author so no collision. |

---

## Future Enhancements (Phase 2+)

These are NOT in scope for Phase 1 but should be noted for leadership pitch:

1. **Salesforce integration** — Replace the `sales_stage` and `opportunity` fields with live SF data via Elastic Salesforce connector or direct API
2. **Automated scheduling** — Background sync on a cron (no manual trigger needed), with the UI becoming a review/override tool rather than the primary ingest trigger
3. **Slack notifications** — Alert team members when new notes are ingested for their account
4. **AI-generated follow-up emails** — Button in the UI that sends the note to Claude API and returns a draft email
5. **Kibana embedded dashboards** — Embed account health dashboards directly in the UI using Kibana's iframe embed
6. **RBAC** — Role-based access so AEs see their accounts, leadership sees all, etc.
7. **Elastic Playground / RAG** — Use Elastic's built-in RAG capabilities to let users query meeting notes with natural language directly in Kibana

---

## File Structure

```
granola-elastic-pipeline/
├── README.md
├── package.json
├── tsconfig.json
├── .env.example
│
├── src/
│   ├── server/
│   │   ├── index.ts            # Express app entry point
│   │   ├── routes/
│   │   │   ├── notes.ts        # GET /api/notes, GET /api/notes/:id (Granola API proxy)
│   │   │   ├── ingested.ts     # GET /api/ingested, GET /api/ingested/:id (Elastic query)
│   │   │   ├── ingest.ts       # POST /api/ingest (write to Elastic + Drive folder)
│   │   │   ├── team.ts         # GET/POST /api/team-members
│   │   │   ├── lookups.ts      # GET/POST /api/lookups
│   │   │   └── sync-status.ts  # GET /api/sync-status
│   │   ├── services/
│   │   │   ├── granola.ts      # Granola API client
│   │   │   ├── elastic.ts      # Elasticsearch client + operations
│   │   │   ├── file-writer.ts  # Write .md files to local Drive folder
│   │   │   └── enrichment.ts   # Tag suggestion, duplicate detection
│   │   └── config/
│   │       ├── elastic-mappings.json
│   │       └── ingest-pipeline.json
│   │
│   └── client/
│       ├── index.html
│       ├── App.tsx
│       ├── pages/
│       │   ├── Dashboard.tsx
│       │   ├── MyNotes.tsx      # Primary workflow page
│       │   ├── TeamView.tsx
│       │   └── Settings.tsx
│       ├── components/
│       │   ├── NoteList.tsx
│       │   ├── NotePreview.tsx
│       │   ├── EnrichPanel.tsx
│       │   ├── ActionItemEditor.tsx
│       │   ├── TagSelector.tsx
│       │   └── IngestProgress.tsx
│       ├── hooks/
│       │   ├── useGranolaNotes.ts
│       │   ├── useElasticSearch.ts
│       │   └── useIngest.ts
│       └── types/
│           └── index.ts
│
├── scripts/
│   ├── setup-elastic.ts        # Creates indices, pipelines, seed data
│   └── seed-lookups.ts         # Populates granola-lookups with defaults
│
└── docs/
    └── leadership-pitch.md     # Talking points for selling this internally
```
