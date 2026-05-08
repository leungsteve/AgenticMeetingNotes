# DealPulse — What We Built

*An internal Elastic tool, built by an SE, for the SE and Sales org.*

---

## The Starting Point: Granola is Great, But…

Granola is already in our workflow. SA and AE teams record every customer call, and Granola delivers clean transcripts with structured summaries — tech environment, action items, sentiment, competitive mentions, what changed. It's genuinely good at the per-meeting layer.

The problem is what happens *after* the note. The intelligence sits in Granola, isolated per meeting, per person. Steve the SA writes four great notes this week. His manager Ed reads Salesforce to prep for Monday's leadership review. Their director Pat reads Ed's summary. VP Kevin reads Pat's summary. By Sunday night, four people have manually re-processed the same four notes, and half the nuance is gone before the forecast call starts.

That's the gap DealPulse closes.

---

## What It Is

**DealPulse is what happens when you take Granola notes and put them into Elasticsearch.**

Every Granola note — summary, action items, tech status RYG, path to tech win, competitive signals, commitments — gets indexed into Elasticsearch with a structured mapping. From that single ingest event, the entire org gets a live, multi-persona view of the pipeline:

- The **SA** sees their open action items, overdue commits, and a pre-drafted Salesforce 1-2-3 update they can paste and send.
- The **AE** sees the procurement signals, exec sponsor map, MEDDPICC qualification depth, and competitive mentions from notes they weren't on.
- The **SA Manager** gets a live risk tracker — RYG rollups, escalations, hygiene gaps, and per-deal MEDDPICC scores — the exact spreadsheet they'd manually assemble before a leadership review, computed automatically from the meeting notes.
- The **Director and VP** get org-wide rollups: how many reds, which SEs have stale accounts, what the Q2 forecast looks like from the ground up.
- The **Sales RVP** gets regional pipeline truth, without waiting for anyone to update Salesforce first.

None of these views exist in Granola. They exist because Elasticsearch is the spine.

---

## Where We're Dogfooding the Platform

This is where it gets interesting from an Elastic perspective — we built this *with* the products we sell.

### Elastic Inference Service (EIS) + Jina Models
Every note summary is embedded using the `.jina-embeddings-v3` model hosted in EIS — no external API call, no data leaving the Elastic project. Semantic search over meeting notes uses those embeddings with hybrid BM25 + ELSER reranking. We're showing customers that semantic search over unstructured text is a first-class Elastic capability, not a bolt-on.

### Elastic Agent Builder
Two agents run in Agent Builder against our own Elasticsearch indices:

1. **Account Intelligence Agent** — the chat surface. SAs ask it questions like "give me the 1-2-3 for Aurora Health" or "which of Pat's deals are red in Q2 commit?" and get cited, structured answers directly from the meeting notes index.
2. **Follow-up Drafter** — invoked automatically after every note ingest. It reads the action items and commitments from the note and drafts a customer recap or internal escalation email. The draft surfaces in the Inbox for the SA to review and send. Nothing auto-sends; the human is always the last step.

### Elastic Workflows
The moment a note is ingested, a Workflows pipeline fires — a manual trigger invoked programmatically via the Kibana API. It logs the execution, records metadata to a dedicated index, and orchestrates the post-ingest sequence: rollup refresh, drafter invocation, completion. Every execution is visible in the Kibana Workflows UI with named steps and timestamps. This is exactly the "document lands → automated pipeline runs" pattern we pitch to customers in observability and security use cases. We're running it on ourselves.

---

## The Productivity Impact

**For an SE:** instead of spending Friday afternoon writing four Salesforce updates, drafting two customer recap emails, and assembling context for Ed's Monday review — the app surfaces all of that the moment the note lands. Steve reviews, edits, sends. The work that takes 2–3 hours takes 20 minutes.

**For a manager:** instead of reading every SE's Salesforce notes before a leadership review, the risk tracker is always current. Rollups recompute in real time after every ingest — not overnight. If Steve ingests a note at 4pm Friday showing Aurora just went red, Ed sees it before the 8am Monday call.

**For leadership:** the org's Q2 forecast is as accurate as the most recent meeting, not the last Salesforce sync. Pipeline truth is no longer gated by whether someone remembered to update a field.

---

## MEDDPICC Without the Spreadsheet

One of the consistent asks from the sales org is better visibility into deal qualification — specifically whether each MEDDPICC dimension (Metrics, Economic Buyer, Decision Criteria, Decision Process, Paper Process, Identify Pain, Champion, Competition) has been captured for every opportunity in the pipeline.

The standard answer is a CRM field SEs manually tick. The problem is nobody fills it in consistently, and by the time leadership asks, the data is stale.

DealPulse computes MEDDPICC coverage automatically from the meeting notes. Most dimensions map to structured fields already in the Granola schema — budget signals map to Metrics, decision-maker attendees map to Economic Buyer, technical requirements map to Decision Criteria, pain points map to Identify Pain, and so on. Decision Process — the customer's internal approval flow (named approvers, gates, sequence, expected timing) — has its own dedicated field on every note that the rollup picks up directly. After every rollup, each opportunity gets a completeness score (0–8) and a per-dimension breakdown with the actual evidence from the notes.

The result: managers see which deals are well-qualified and which are missing a champion, an economic buyer, or a clear decision process *before* the Monday leadership review, not after. And any SA, AE, or manager can ask the Account Intelligence Agent "which of my deals are missing a decision process?" and get an answer in plain English.

No new spreadsheet. No CRM tick-box. MEDDPICC depth falls out of what SEs already write.

---

## The Bigger Point

We tell customers that Elasticsearch is the platform for the AI era — semantic search, inference at ingest, agents with retrieval, workflow orchestration, all in one stack. This tool is us living that story. The data (meeting notes) already existed. We didn't change what SEs do. We just gave those notes a home where the whole platform could work on them — and in doing so, built something that makes every layer of the org faster, better informed, and less dependent on the person with the best memory.

That's the pitch. That's also what we built.
