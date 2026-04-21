# Granola → Elastic Meeting Intelligence Pipeline

A web application that turns meeting notes from [Granola](https://granola.ai) into a searchable, structured knowledge base powered by [Elastic Serverless](https://www.elastic.co/elasticsearch/serverless). Built for pre-sales account teams (AEs, SAs, Customer Architects, and leadership) who need to capture, enrich, and share meeting intelligence across their team.

## The Problem

Pre-sales teams generate a massive amount of context in customer meetings — technical requirements, competitive intel, budget signals, action items, stakeholder dynamics — but this information ends up siloed in individual note-taking tools. There's no easy way to:

- Search across all meetings for a specific account ("What did Adobe say about their migration timeline?")
- Track action items and commitments across the team
- Give leadership visibility into account health without attending every meeting
- Build institutional knowledge that survives team changes
- Feed meeting context into AI tools like Claude for follow-up emails, demo planning, and account strategy

## The Solution

This app provides a human-in-the-loop workflow:

1. **Capture** — Granola records and summarizes meetings using a structured template that extracts attendees, technical details, action items, competitive intel, budget signals, and more
2. **Review & Enrich** — Team members pull their notes into a web UI, review the AI-generated content, and add structured metadata: account, opportunity, sales stage, tags, and detailed fields across 13 enrichment categories
3. **Ingest** — With one click, enriched notes are indexed into Elastic Serverless (with semantic embeddings for vector search) and written as Markdown files to a shared Google Drive folder
4. **Query** — The team searches and filters ingested notes in the app's Team View, Kibana dashboards, or via Claude Desktop pointed at the shared Drive folder

```
Granola (capture) → Web UI (review & enrich) → Elastic Serverless (index & search)
                                               → Google Drive (shared .md files)
                                               → Claude Desktop (AI queries)
```

## Key Features

- **Granola API integration** — Pulls notes directly from Granola's API for each team member
- **Structured enrichment UI** — 13 collapsible sections for tagging and enriching notes: classification, attendees (with decision-maker/champion flags), action items, commitments, technical environment, customer sentiment & objections, competitive landscape, budget/timeline/procurement, demo/POC requests, resources shared, and more
- **Auto-tagging** — Ingest pipeline automatically suggests tags based on content (competitive mentions, demo requests, security concerns, escalations, etc.)
- **Semantic search** — Vector embeddings enable natural language queries across all meeting notes
- **Re-ingestion** — Update metadata on previously ingested notes with full version history tracking
- **Team visibility** — Browse, search, and filter all ingested notes across the team
- **Google Drive sync** — Notes written as .md files to a local Google Drive for Desktop folder; Google Drive handles cloud sync and team sharing automatically
- **Claude Desktop integration** — Team members point Claude at the shared Drive folder for AI-powered account intelligence

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     WEB UI (React + Tailwind)                │
│  My Notes (review/enrich) │ Team View │ Dashboard │ Settings │
└─────────────────────────────┬────────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │  Backend (Express) │
                    └────┬─────────┬────┘
                         │         │
              ┌──────────┘         └──────────┐
              ▼                               ▼
┌───────────────────────┐        ┌────────────────────────┐
│   Elastic Serverless  │        │  Local Filesystem      │
│                       │        │  (Google Drive folder)  │
│ • Meeting notes index │        │                        │
│ • Sync state index    │        │  Auto-syncs via Google  │
│ • Lookups index       │        │  Drive for Desktop to   │
│ • Ingest pipeline     │        │  shared team folder     │
│ • Semantic embeddings │        │                        │
└───────────────────────┘        └────────┬───────────────┘
                                          │
                                          ▼
                                 Claude Desktop / Project
                                 (AI-powered account queries)
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| Backend | Node.js, Express, TypeScript |
| Search & Storage | Elastic Serverless (Elasticsearch project type) |
| File Sync | Google Drive for Desktop (local folder write, no API needed) |
| Meeting Capture | Granola API (REST, bearer token auth) |
| AI Queries | Claude Desktop reading from shared Drive folder |

## Prerequisites

- **Node.js** 18+
- **Granola** Business or Enterprise account (for API access)
- **Elastic Cloud** account with a Serverless Elasticsearch project
- **Google Drive for Desktop** installed, with access to a Shared Drive
- **Claude Desktop** (optional, for AI queries over meeting notes)

## Quick Start

### 1. Clone and install

```bash
git clone <repo-url>
cd granola-elastic-pipeline
npm install
cp .env.example .env
```

### 2. Set up Elastic Serverless

Follow the [Elastic Serverless Setup Guide](PROJECT_BRIEF.md#elastic-serverless-setup-guide) in PROJECT_BRIEF.md:

1. Create an Elasticsearch Serverless project at [cloud.elastic.co](https://cloud.elastic.co)
2. Copy your **Cloud ID** from the project overview
3. Create an **API key** under Management → API keys
4. Add both to your `.env` file:
   ```env
   ELASTIC_CLOUD_ID=your-cloud-id-here
   ELASTIC_API_KEY=your-api-key-here
   ```

### 3. Configure Google Drive path

Set the local path where Google Drive for Desktop mounts your Shared Drive:

```env
# macOS example:
DRIVE_NOTES_PATH=/Users/you/Library/CloudStorage/GoogleDrive-you@company.com/Shared drives/Account Teams

# Windows example:
DRIVE_NOTES_PATH=G:\Shared drives\Account Teams
```

### 4. Initialize Elastic indices

```bash
# Create indices, mappings, and ingest pipeline
npm run setup:elastic

# Seed lookup values (accounts, tags, meeting types, etc.)
npm run seed:lookups
```

### 5. Configure Granola

Each team member needs to:
1. Generate a Personal API key in Granola (Settings → API)
2. Set up the recommended [meeting notes template](PROJECT_BRIEF.md#3-configure-your-meeting-notes-template) — this ensures Granola's AI output is structured for the pipeline

### 6. Run the app

```bash
npm run dev
```

Open the app in your browser, go to **Settings**, and add team members with their Granola API keys.

## Team Roles

| Role | How They Use the App |
|------|---------------------|
| **Solutions Architect (SA)** | Captures technical meetings, enriches with technical environment details, triggers demo/POC workflows |
| **Account Executive (AE)** | Reviews all account activity, tracks deal stage signals, monitors competitive landscape and budget/timeline |
| **Customer Architect (CA)** | Post-sale context, reviews technical decisions and commitments made during pre-sales |
| **Leadership (SA/Sales Mgr)** | Dashboard view of account health, sentiment trends, open action items across the team |

## Data Model

All meeting notes are stored in a single Elastic index (`granola-meeting-notes`) with structured fields for:

- **Classification**: account, opportunity, meeting type, sales stage, tags
- **People**: structured attendees with name, title, company, email, and role flags (decision maker, champion, technical evaluator)
- **Content**: summary, key topics, decisions made, transcript, open questions
- **Technical**: current stack, pain points, requirements, scale, integrations, constraints
- **Sales Intelligence**: customer sentiment, objections, champion signals, competitive landscape, budget/timeline/procurement signals
- **Action Tracking**: action items (with owner/due/status), commitments made, resources shared/requested
- **Scheduling**: next meeting date, agenda, attendees
- **Versioning**: version number, update history with change tracking

See [PROJECT_BRIEF.md](PROJECT_BRIEF.md) for complete index mappings and field descriptions.

## Documentation

| Document | Description |
|----------|-------------|
| [PROJECT_BRIEF.md](PROJECT_BRIEF.md) | Complete technical specification — architecture, index mappings, ingest pipeline, UI spec, edge cases, setup guides for Elastic and Granola |
| [CURSOR_PROMPT.md](CURSOR_PROMPT.md) | Step-by-step build prompt for Cursor AI — paste into Cursor to scaffold and build the application |

## Roadmap (Phase 2+)

- **Salesforce integration** — bidirectional sync of opportunity data and activity updates
- **Automated ingestion** — scheduled background sync with the UI as a review/override layer
- **Slack notifications** — alert team members when new notes are ingested for their accounts
- **AI-generated follow-ups** — draft follow-up emails directly from meeting notes using Claude API
- **Kibana embedded dashboards** — account health dashboards embedded in the app
- **RBAC** — role-based access control (AEs see their accounts, leadership sees all)
- **Elastic RAG** — natural language queries over meeting notes using Elastic's built-in retrieval-augmented generation

## License

[TBD]
