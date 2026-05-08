# Demo script — a layered operating system, told as a Friday afternoon

This is the script you run when you walk a sales or SA audience through the
tool. It follows one fictional Friday afternoon up the org chart — SA, AE, SA
Manager, SA Director, SA VP, then Sales RVP — and ends with the agent. The
story is the throughline; the views are the props.

- **Total time.** 25 minutes if you talk through every beat. 12 minutes if
  you skip the AE / Sales-RVP beats. 6 minutes for the elevator version
  (cold open + Manager + VP + Chat).
- **Setup.** Run [the demo](#environment-checklist) below at least once
  before showtime. The data is synthetic — no real customer names anywhere.
- **Who's in the cast.**
  - **Steve Leung** — SA, owns Aurora Health and Helix Robotics among others.
  - **Priya Shah / Marcus Li** — AEs paired with Steve.
  - **Ed Salazar** — SA Manager (frontline). Steve's manager.
  - **Marisa Chen** — peer SA Manager. Manages Jordan, Morgan, Alex, Taylor.
  - **Pat Morgan** — SA Director. Covers Ed and Marisa.
  - **Kevin Qadri** — SA VP. Pat's manager. Head of pre-sales.
  - **Dana Fields** — Sales RVP, AMER region.
  - **Ines Ortega** — Sales RVP, EMEA region.
  - **Regan Holt** — Sales AVP. Dana and Ines's manager.

> Tip: As you go, switch identities using **View as** in the top-right header.
> The whole app re-skins for that persona. Or hit each page directly with the
> URLs called out under each beat.

## Environment checklist

Before showtime, with the dev server running:

```bash
npm run demo:reset && npm run demo:all
```

That replays opportunities + **30** synthetic Granola meeting notes across
**6 narrative arcs** (Aurora SEC, Helix PLAT, Polaris SEC, Meridian SVL,
Stratum OBS, Redwood — see `SCENARIOS` in `scripts/seed-demo-notes.ts`;
count printed at end of `npm run seed:demo-notes`) + rollups + alerts +
Friday digests. Confirm:

- `/risk` shows ~12 opportunity rows (one per CSV row) colored by RYG.
- `/manager` shows Ed's 5 panels with at least 2 reds in the escalation queue.
- `/director`, `/vp`, `/sales-rvp` render rollup cards.
- `/inbox` has unread digests for Steve and Ed.

If `/manager` is empty, your session user is auto-resolving to a manager who
owns nothing — pick `ed.salazar@elastic.co` from the **View as** dropdown.

---

## Cold open (60 seconds, no slides)

> "It's Friday at 4pm. Steve is an SA at Elastic. He had four customer
> meetings this week — three different accounts, two of them in commit for
> Q2. His manager Ed has a leadership review at 8am Monday. Ed's peer
> manager Marisa is out sick, so their director Pat is going to cover both
> teams. Their VP Kevin needs a clean number for Q2 forecast. Right now,
> here's what each of them is doing:
>
> Steve is reading his own Granola notes from the four meetings he had this
> week so he can draft Salesforce updates for each opportunity. Ed is
> reading those Salesforce updates so he can summarize them for Pat. Pat is
> reading Ed's and Marisa's summaries so she can summarize them for Kevin.
> Kevin is reading Pat's summary so he can present a forecast to the CRO.
>
> Four people, four versions of the same notes, every Friday. By Sunday
> night, half the nuance is gone and nobody trusts the dashboard.
>
> What you're about to see is the same data, captured once, and *rendered*
> at every layer of the org. The Granola notes don't change. The Risk
> Tracker spreadsheet doesn't change. What changes is that nobody re-types
> the same intelligence three times."

That sets the frame: **layered operating system, single spine.**

---

## Beat 1 — The Solutions Architect (Steve), 4 minutes

**Persona.** Steve, SA. **Pages.** `/notes`, `/team`, `/risk`, `/inbox`.

Switch **View as → steve.leung@elastic.co**.

### `/notes` (90 seconds)

> "This is what Steve sees Friday afternoon. He's run four meetings this
> week. Each one was recorded by Granola, our meeting-notes app, and
> ingested here with a structured shape — summary, technical environment,
> action items, sentiment, RYG, Path to Tech Win, what changed."

Click into the **Aurora Health Systems · Aurora Security Analytics**
note. Show:

- The summary (2-3 lines)
- Action items with owners and due dates
- The "What changed" field
- The Path to Tech Win sentence

#### Where each field comes from

There are **two layers** at play. The audience will absolutely ask, so
say it out loud before they have to:

> "Granola does the **per-meeting** capture. Steve set up a template once
> in Granola — summary, action items, technical environment, sentiment,
> competitive landscape, and the 1-2-3 fields: tech status RYG, path to
> tech win, what changed, help needed. Every meeting Granola records,
> those fields come out filled in. **Steve writes the answers in Granola
> as he runs the call**, or right after. It is not magic — it is a
> template plus a transcript plus a model. **'What changed' is Steve's
> answer to the question** *what changed since last week*; we just give
> him a consistent slot to put it in."
>
> "Then **this app** layers on top of Granola. It picks up the structured
> notes, links meetings that share attendees into one *meeting group*
> (so two SAs on the same call don't double-count), embeds the summary
> for semantic search, denormalizes action items into an open/overdue
> tracker, and rolls every opportunity up to its **latest** RYG, latest
> 'what changed', latest path to tech win, latest milestone. That rollup
> is what powers `/risk`, `/manager`, `/director`, `/vp`, the Friday
> digest, and the agent."

If anyone presses on "but who *decides* it's red?" the answer is:

> "The SA writes red, yellow, or green in Granola during the call, based
> on the same criteria they'd use in Salesforce today. The app doesn't
> infer the color — it surfaces the SA's call. The escalation flag on
> top of that *is* derived: red + Tier-1 + ACV ≥ $1M, or red persisting
> 14+ days, triggers an escalation in the rollup."

### `/team` (45 seconds)

Click **Team View**. Open the Account dropdown — show that it's a **typeable
combobox** with chevron, and click into **Aurora Health Systems**.

> "Now it's not just Steve's notes — it's everything anyone on the pursuit
> team has captured for this account. Priya the AE ran a procurement
> sync without Steve. Ed the SA Manager had an internal pre-call. The
> CA on the existing Aurora footprint dropped a health-check note. All
> of it lands in the same index, all of it is searchable side-by-side."

Filter by **Author role → AE**.

> "Now Steve sees only Priya's notes — the procurement and exec context
> he wasn't on. Same trick works for SA Manager, CA, Sales RVP. This is
> how the SA stops being the single point of memory for the account."

### `/risk` (60 seconds)

Click **Risk Tracker**. Filter Manager → ed.salazar@elastic.co.

> "Here's where it stops being one-person and starts being managerial.
> This is Ed's risk tracker — exactly the spreadsheet he reviews with
> Kevin every Friday. RYG colors are not bullshit; they come from the
> meeting notes. Click into Aurora to see Path to Tech Win, what changed
> this week, what the SE needs from leadership."

Expand the **Aurora row** to show the inline detail. Sort by ACV, then by
RYG.

### `/inbox` (45 seconds)

Click **Inbox**.

> "Friday afternoon at 4pm, Steve gets this auto-digest. It's a
> three-section update — Tech Win + Why, Activity this week, Planned next
> week — that he can paste straight into Salesforce. He didn't write it;
> the agent did, from the same notes you just saw."

Open the digest, scroll the markdown preview.

> "Five minutes of review instead of forty. He still owns the words that
> ship — he's reading the digest, editing two lines, then pasting. But he
> didn't *generate* it from scratch."

**Beat-1 takeaway:** "The SA is the source of truth and gets time back."

---

## Beat 2 — The SA Manager (Ed), 4 minutes

**Persona.** Ed Salazar. **Pages.** `/manager`.

Switch **View as → ed.salazar@elastic.co**. Land on `/manager`.

> "Now I'm Ed. Same data. Different lens."

Walk the page top-to-bottom.

### Top stats and escalation queue (60 seconds)

> "Four numbers above the fold: 12 opps, 4 reds, 3 yellows, 4
> escalations. The first thing Ed cares about is the **exec escalation
> queue** — a high-severity opportunity-at-risk alert is a deal that's
> red AND either commit-category or above $1M ACV. Two of his deals
> qualify."

Click into the first escalation card. Show that the SA has already
written a one-line reason.

> "Ed didn't have to ping Steve on Slack to find out why Aurora is red.
> The reason is right here, written by Steve in Tuesday's POC sync."

### All reds + Top 10 ACV (60 seconds)

> "Below the fold are the panels Ed actually walks his Monday standup
> from. Every red, sorted by ACV. Top 10 by ACV regardless of color —
> because those are the ten Kevin will ask about. Tier-1 accounts and
> Hygiene Gaps tell him *who* hasn't been keeping notes fresh — there's
> Steve at the bottom because he hasn't touched Polaris in 18 days."

### Run Friday digest (45 seconds)

Click the **Run Friday digest** button.

> "This kicks off five digests, one per SE on his team, plus one
> aggregated digest for him. The aggregate is what Ed will share in the
> #pre-sales-leadership channel by 5pm. He didn't write any of it."

### Level pivot strip (45 seconds)

Point at the thin chip row at the top of the page: **Manager · Director
· VP**.

> "Marisa is out sick. Ed is acting director on Monday. He clicks
> 'Director' here and it pre-fills Pat's filter — same data, one level up.
> No new login, no new tab."

Click **Director**.

**Beat-2 takeaway:** "The manager runs his Monday review from one
URL — and can climb one rung when his peer is out."

---

## Beat 3 — The SA Director (Pat), 3 minutes

**Persona.** Pat Morgan. **Pages.** `/director`.

You arrived from the level pivot. Show the URL: `/director?director_email=pat.morgan@elastic.co`.

### Per-manager rollup cards (90 seconds)

> "Two cards: one for Ed's team, one for Marisa's. Same panels you saw
> on `/manager`, but rolled up. Ed has more reds. Marisa has more stale
> opps but more ACV in commit. Each card has a stacked RYG bar — Pat can
> see at a glance how each team's portfolio is shaped."

Click "Open this manager's dashboard →" on Ed's card.

> "Drilling in is one click. She lands on Ed's Manager Dashboard —
> filtered, no copy-paste."

Hit back.

### Cross-org escalation queue (45 seconds)

> "Below the per-manager cards, Pat sees the union of escalations across
> *both* of her managers' teams. Three deals. She can prep the right
> three questions for the Monday call and skip the rest."

### Top 10 by ACV (30 seconds)

> "Same top-10 panel, but spanning both teams. This is where she catches
> patterns — both Ed and Marisa have a red Tier-1 in Q2. Coincidence?
> Probably not. She'll dig into both."

**Beat-3 takeaway:** "Same dashboards, just one rung up. No new training."

---

## Beat 3b — MEDDPICC Qualification Depth, 2 minutes

**Persona.** Pat Morgan (or Ed Salazar). **Page.** `/risk`.

This beat works best after Beat 3. Navigate to the Risk Tracker: `/risk`.

> "Every deal now carries a **MEDDPICC completeness score** — computed directly from the meeting
> notes, not from a CRM field anyone had to fill in manually."

Point to the MEDDPICC column.

> "The number is how many of the eight MEDDPICC dimensions — Metrics, Economic Buyer, Decision
> Criteria, **Decision Process**, Paper Process, Identify Pain, Champion, Competition — show up in
> the notes for that opportunity. Helix Robotics is 7/8. Aurora Health Systems is 6/8."

Click a row to expand it.

> "Expanding any row shows which dimensions are covered in green, and which are blank. Every
> covered dimension cites the actual evidence pulled from the note — not a manual summary, not
> a 'yes' checkbox someone clicked."

Point to a missing dimension (e.g., Decision Process = uncovered).

> "Decision Process is blank for this deal. That's not a data quality problem — it means the
> notes haven't captured the customer's internal approval flow yet: who signs, in what order, on
> what timeline. That is a **selling signal**: the next call should surface it. Pat can flag it
> right now without asking the SE."

### MEDDPICC in the Chat (45 seconds)

Switch to `/chat`.

Type: `What's the MEDDPICC status for Aurora Health Systems?`

> "The same MEDDPICC data surfaces in the agent. The AE, the manager, anyone who has access can
> ask in plain English and get a structured breakdown of where the deal is qualified — and
> where it isn't."

Type: `Which of my deals are missing a champion, economic buyer, or decision process?`

> "That's a CRM query most SEs can't answer without pulling a Salesforce report. Here it's a
> single sentence."

**Beat-3b takeaway:** "MEDDPICC coverage is computed from what SEs already write — no new
fields, no form to fill. The sales org gets qualification depth for free, including the
Decision Process dimension that almost never makes it into a CRM consistently."

---

## Beat 4 — The SA VP (Kevin), 3 minutes

**Persona.** Kevin Qadri. **Pages.** `/vp`.

Switch **View as → kevin.qadri@elastic.co**, or click **VP** on the
level pivot. URL: `/vp?vp_email=kevin.qadri@elastic.co`.

### Per-director rollup (45 seconds)

> "Today Kevin has one director — Pat. As his org grows there'll be
> three or four. Same card pattern. He sees the shape of each director's
> org without drowning in 50 deals."

### Top 10 by ACV — Path to Tech Win (60 seconds)

> "This is the panel Kevin keeps asking for. Top 10 deals by ACV, but
> instead of just RYG, the *Path to Tech Win* sentence is the headline.
> 'On Aurora we need SAML SSO + on-prem deployment exception by 5/15 to
> ship the POC.' That's what he reads to the CRO Monday — straight from
> Steve's mouth, two weeks ago."

### Asks of leadership (60 seconds)

> "And this is the panel Kevin's chief of staff would otherwise *build*
> by hand at 11pm Sunday. Every `help_needed` flag from every SE in the
> org, in one place, sorted by severity. Kevin can decide which ones he
> takes Monday and which ones he punts to Pat."

**Beat-4 takeaway:** "Kevin gets the same five-bullet exec brief he was
already getting. He just gets it for free, with citations."

---

## Beat 5 — The Sales side (Dana), 3 minutes

**Persona.** Dana Fields. **Pages.** `/sales-rvp`.

Switch **View as → dana.fields@elastic.co**. URL:
`/sales-rvp?rvp_email=dana.fields@elastic.co`.

> "Now I'm Dana, a Sales RVP. Different hierarchy — AE → RVP → AVP — but
> the same opportunity spine. The dashboards mirror across."

### Forecast distribution (30 seconds)

> "Above the fold: how is my $24M of pipeline distributed? Commit /
> upside / pipeline. The numbers match Clari, which we read from."

### Per-AE rollup (60 seconds)

> "One card per AE. Ordered by total ACV, then by escalation count.
> Priya is the biggest book; Marcus has the most reds; Renee has only
> EMEA — but I share a regional view with Ines, so they show up under
> Ines's `/sales-rvp` instead."

### Commits with tech red (90 seconds)

> "And this is the panel I open *first* on a forecast call. Every
> commit-category deal that has a tech-red Tech Status. The point isn't
> to argue with the AE — it's to know in advance: 'Marcus, on Helix, the
> SE flagged a permissioning blocker on May 6. Where are we Monday?'"

> "I'm not asking Marcus to type that into a forecast tool. The SE
> already wrote it during a meeting. We're rendering it for me."

**Beat-5 takeaway:** "Sales and SA each get the dashboard their job
needs. Same data, two narratives."

---

## Beat 6 — The Agent (everyone), 2 minutes

**Pages.** `/chat`.

> "Now ignore everything you just saw. Imagine you're new on the team and
> you don't know which of these dashboards has what. You go here."

Click **Chat**.

Type:

> "Tell me the latest on Helix Robotics."

Wait for the response. Show citations.

> "That's the same data as `/accounts`, plus Risk Tracker fields, plus
> what changed last week. The agent ran several tools — it tells you
> which — and cited the source notes. Click any citation to read the
> meeting note."

Type:

> "Give me the 1-2-3 for Aurora."

> "And that's a Salesforce update. Tech Win + Why is the headline. This
> week's activity is paragraph two. Next week's plan is paragraph three.
> Steve pastes that into the SFDC opportunity, edits two adjectives, hits
> save."

Optionally type one more:

> "Which of Pat Morgan's deals have a red Tech Status and are close-quarter Q2?"

> "Same query Pat would have asked an analyst. Twelve seconds, with citations."

**Beat-6 takeaway:** "Dashboards are answers we anticipated. Chat is
the questions we didn't."

---

## Beat 7 — DealPulse: Real-Time Pipeline Truth (hackathon demo, 3 minutes)

> Use this beat as a **standalone 3-minute video** for the FY27 FE Summit hackathon submission,
> or append it to the 6-minute elevator demo. This beat showcases **Elastic Workflows** +
> **Agent Builder** as an orchestration layer on top of the existing app.

**Pages / surfaces:** Live ingest → `/inbox` Drafts tab → Kibana Workflows execution history.

---

### [0:00–0:18 — Hook]

Start on the Risk Tracker or My Notes — wherever data is visible.

> "Here's the problem we haven't solved yet. Steve finishes a meeting, Granola
> captures it, he ingests the note — but the Risk Tracker is still showing
> yesterday's rollup. And the recap email to the customer? Still on his to-do
> list at 6pm.
>
> Two things that should be automatic aren't. Let's fix both, live."

---

### [0:18–0:55 — Real-time rollup + Workflow]

Open a terminal (or use the existing ingest flow in the app). Ingest a note — or use
the one already in the demo data. The Risk Tracker should update within seconds.

> "Watch the Risk Tracker. I just ingested a meeting note from the Meridian Systems
> call. The rollup recomputes **immediately** — not tonight, not on the next cron job.
> The tech status, the path to tech win, what changed — all live."

Switch to Kibana. Open **Workflows → Field Loop Post-Ingest Orchestration → Executions**.

> "Behind that ingest, an Elastic Workflow fired. Every step is logged here: rollup
> refresh, drafter invocation, completion. This isn't our app scheduling things —
> it's **Elastic Workflows** orchestrating the post-ingest pipeline. Steve doesn't
> see this; leadership does, when they ask 'when did the data last update?'"

Show the most recent execution. Point to the steps.

> "The execution ID, the timestamp, the inputs — note ID, account, who ingested it.
> Full audit trail in Kibana without touching a third-party scheduler."

---

### [0:55–1:35 — Follow-up Drafter]

Switch to the app. Go to **Inbox → Drafts tab**.

> "Same ingest, second outcome. While the rollup was refreshing, the Agent Builder
> agent was reading the note — action items, commitments, attendees — and asking:
> does this need a follow-up email?
>
> It decided yes. Here's what it drafted."

Click **Open draft** on the Meridian Systems draft.

> "Customer recap. Subject line, body, recipient hint from the attendee list.
> Three-sentence summary of what we aligned on, bullet list of next steps, our
> commitment to deliver the sandbox in three days.
>
> Steve didn't write this. He reads it, edits one line if needed, copies it to
> Gmail. Takes thirty seconds instead of ten minutes."

Point to the footer.

> "Notice the footer: 'Never auto-sent. Human sends only.' We are not building
> an autonomous email bot. We are building a **draft queue** — the agent does the
> first 90% and puts it in front of a human for the last 10%."

Show the Helix Robotics internal draft.

> "For the Helix call — which is an internal escalation, not a customer recap — the
> agent drafted an internal note to Ed: data residency blocker, Splunk renewal in
> six weeks, ask of leadership. Same trigger, different persona, different output."

---

### [1:35–2:15 — The platform story]

Stay on the Drafts tab or switch back to Kibana.

> "The stack here is pure Elastic. Notes live in Elasticsearch. Rollups are in
> Elasticsearch. Drafts are in Elasticsearch. The orchestration — what happens after
> a note lands — is in **Elastic Workflows**. The intelligence in the drafts comes
> from an **Agent Builder** agent with access to the same Elasticsearch indices.
>
> No Lambda. No Zapier. No external LLM API call that leaves your data perimeter.
> The whole loop runs inside the same Elastic project your data already lives in."

---

### [2:15–2:45 — Optional: Chat as ad-hoc surface]

Switch to the Chat page.

> "The Inbox surfaces what the agent *decided* to draft. Chat surfaces what you
> *decide* to ask. Same Agent Builder agent, same data — but now Steve can say:
> 'Did Meridian mention competitors?' or 'What did we commit to Aurora this week?'
> Conversational retrieval over the same spine."

Type: `Summarize the latest meeting for Meridian Systems`

Show the response with citations.

---

### [2:45–3:00 — Close]

> "DealPulse: note lands → rollup refreshes in real time → Workflow logs the
> execution → Agent Builder drafts the follow-up → human reviews and sends.
>
> Field Engineers spend time selling. The pipeline stays current. Leadership reviews
> on Monday morning with data that's hours old, not days."

**Hackathon beat takeaway:** DealPulse — real-time pipeline truth + Elastic Workflows orchestration +
Agent Builder drafting — all from a single note ingest.

---

## Closing (60 seconds, no slides)

> "Five layers — SA, AE, SA Manager, SA Director / VP, Sales RVP / AVP —
> and they all read the same opportunity spine and the same Granola
> notes. The intelligence isn't created by the dashboards; it was
> already in the meeting. The dashboards just stop us re-typing it three
> times.
>
> The cultural shift is consistency. Every person, every level,
> operating with the same quality of context regardless of tenure or
> memory. The SA who joined yesterday walks into Aurora as prepared as
> the one who's been on the account for two years.
>
> Next steps: in the next sprint we wire the live Salesforce API so the
> spine updates itself, and Slack-publish the Friday digest into
> #pre-sales-leadership. The cadence stays the same; the manual steps go
> to zero."

---

## Variants

- **6-minute elevator demo.** Cold open → `/manager` (90s) → `/vp` (60s) →
  `/chat` (90s) → close (60s).
- **AE-heavy demo.** Spend more time on `/team` (filter by author=Priya),
  `/risk` (filter forecast=commit), `/sales-rvp`, then `/chat` ("which of
  Priya's commits have a tech red?").
- **CA-heavy demo.** Lead with `/accounts` (the pursuit team table), then
  flip to `/notes` to show the pre-sales context the CA inherits, then
  `/chat` ("what was promised in pre-sales for Helix?").
- **Leadership-only demo.** Skip Beats 1, 5. Open with `/vp`, drill to
  `/director`, drill to `/manager`, end with `/chat`. 10 minutes total.

## What to NOT show in a demo

- The Settings page (boring).
- `/outbound-sfdc` (still in stub mode for the public-facing demo).
- The Tier filter mechanics (mention tiers verbally, don't click).
- Re-generate buttons during the live walkthrough (they take 5-15 seconds
  and break the rhythm — pre-bake the data with `npm run demo:all`).

## What to NOT say

- Don't promise live Salesforce. Today the spine is CSV-loaded into
  Elastic; the contract is the index, not the CSV. See
  [data-sources.md](./data-sources.md).
- Don't claim the agent decides anything autonomously. It reads from
  Elastic and writes audit logs to `/outbound-sfdc`. Humans still type
  the final line and hit Save.
- Don't read the role names from the screen — say "Pat, the Director" or
  "Kevin, the VP", not "the user with `vp_email = kevin.qadri@elastic.co`."
  The audience zones out the moment you say a column name.
