# Views overview — what every page is, who it's for, and the story it tells

This document is a one-page-per-view reference. Use it when:

- You're prepping a demo and want to know exactly what to point at on each page.
- A teammate asks "what does the Director Dashboard show that the Manager Dashboard doesn't?"
- You're picking a page for a screenshot in a deck.

Each entry follows the same shape:

> **What it is** · **Who it's for** · **What story it tells** · **Key panels** · **The 30-second pitch**

The pages are listed in nav order (`/` first, `/settings` last). For the org
hierarchy they wire to, see [tier-definitions.md](./tier-definitions.md). For
the demo data they read from, see [data-sources.md](./data-sources.md).

---

## 1. `/` — Dashboard (home)

- **What it is.** Lightweight landing page that shows pipeline ingestion health: total notes ingested, notes this week, active team members, notes per teammate, and the most recent ingestions.
- **Who it's for.** Anyone — but practically, the SA who just dropped a Granola note and wants confirmation it's in the index, and the manager who wants to glance at "is the team using this?".
- **What story it tells.** "The intelligence pipeline is alive. Here's the heartbeat." It's the *plumbing* tab — not where decisions get made.
- **Key panels.** Sync stats, per-author note counts, recent ingestions, "unassigned account" triage count.
- **30-second pitch.** "Granola records the meeting, this page proves it landed in Elastic."

## 2. `/notes` — My Notes

- **What it is.** The SA's personal Inbox of meeting notes ingested from Granola. Filter by date, search by content, drill into a single note's structured fields (summary, technical environment, action items, sentiment, RYG, Path to Tech Win, etc.).
- **Who it's for.** Solutions Architects (and AEs who use the same workflow). This is "my desk."
- **What story it tells.** "After every meeting, your Granola note becomes a structured, searchable record without you typing a thing." The SA sees their own work; nothing here for leadership.
- **Key panels.** Note list with title/account/date, full structured note panel, action items, "what changed" flag.
- **30-second pitch.** "I run my customer call, hit save in Granola, and 30 seconds later this page has the note enriched with everything I'd otherwise have to write up."

## 3. `/team` — Team View

- **What it is.** A shared Inbox across the whole team. Every dropdown is a free-text combobox: Account, Opportunity, Author, Author role, Meeting type, Sales stage, plus a free-text query and date range.
- **Who it's for.** Anyone collaborating on the same accounts — peer SAs, AEs, CAs, and managers spot-checking work.
- **What story it tells.** "Every meeting from anyone on the team is searchable in one place. Filter to a single account or a single SE; both work." It's the connective tissue.
- **Key panels.** Filter strip (8 filters with chevron dropdowns), result list with author/role pill, click-through to the structured note.
- **30-second pitch.** "Before this, when an AE asked me 'what did Customer Architect Maya say in last month's review?' I had to dig through Granola or text Maya. Now it's three clicks."

## 4. `/accounts` — Accounts

- **What it is.** Account-level rollups (across every meeting per account) plus the *pursuit team* roster — every SA / SA Manager / SA Director / SA VP / AE / Sales RVP / Sales AVP / CA on the deal, with a colored role pill.
- **Who it's for.** Anyone who joins an account mid-stream — a CA inheriting a pre-sales account, a new SE getting added to a pursuit team, a manager onboarding a hire.
- **What story it tells.** "This account has had 14 meetings, last touched 3 days ago, sentiment trending positive, momentum +0.2. Here's everyone on the deal and their role. Here's the running notes." It's the *who and how-warm* view.
- **Key panels.** Sortable account list (left), header stats (meetings / last meeting / open action items / momentum / sentiment), pursuit-team table with role pills, freeform notes editor.
- **30-second pitch.** "When Pat Morgan adds a new SE to her org and routes them to Aurora Health, she points them here. They get six months of context before they walk in the room."

## 5. `/risk` — Risk Tracker

- **What it is.** A direct, opportunity-by-opportunity mirror of Kevin's Risk Tracker spreadsheet. One row per opportunity, RYG-colored, sortable, filterable by SE / Manager / Forecast / Tech Status / Tier / Account, exportable to CSV.
- **Who it's for.** Frontline SAs (their portfolio), SA Managers (their team's portfolio), and the leadership review meeting that already runs every week off the spreadsheet.
- **What story it tells.** "This is the spreadsheet you already use, except the Tech Status, Path to Tech Win, What Changed, and Help Needed columns are computed from the actual meeting notes — no SA is updating cells by hand on Friday afternoon."
- **Key panels.** Filter strip (6 filters with chevron dropdowns), color-tinted rows (red / yellow / green / no-rollup), sortable headers (Opp, ACV, Close, Forecast, RYG), inline expansion for full Path to Tech Win + reasoning, "Re-generate from notes" button per row, Export CSV.
- **30-second pitch.** "The spreadsheet you opened this morning — but truthful, because the agent fills in the columns from the same Granola notes you'd otherwise be reading."

## 6. `/manager` — Manager Dashboard

- **What it is.** Five-panel dashboard showing only what an SA Manager (Ed, Marisa) cares about. Auto-resolves to the manager linked to the logged-in user.
- **Who it's for.** SA Managers preparing for a 1:1 with their SAs, a forecast call, or a cross-functional escalation.
- **What story it tells.** "It's Friday afternoon. You manage 6 SAs and 28 deals. Here's the three things you actually have to act on this weekend, and the four reds you'll want to bring to Kevin Monday morning."
- **Key panels.**
  - **Stats bar:** Opportunities · Red · Yellow · Escalations.
  - **Exec escalation queue:** High-severity opportunity-at-risk alerts (red AND (commit OR ACV ≥ $1M)).
  - **All reds across the team** (sorted by ACV).
  - **Top 10 opportunities by ACV** (the same list Kevin asks about).
  - **Tier-1 accounts at-a-glance.**
  - **Hygiene leaderboard** (which SEs haven't updated which opps in 7+ days).
  - **Level pivot strip:** thin chip row at top — "Manager · Director · VP" — to flip up one level with the right director/VP pre-filled.
  - **Run Friday digest** button (kicks off per-SE digests).
- **30-second pitch.** "When I move from being Steve's manager to being Pat's director-of-the-week, this is the page where I save 90 minutes of prep on Sunday night."

## 7. `/director` — Director Dashboard

- **What it is.** A rollup-of-rollups for the SA Director (Pat). One card per direct-report manager, each card showing the manager's RYG distribution, total ACV, escalation count, hygiene gaps, and top-3 deals — with a drill-down link to that manager's `/manager` page.
- **Who it's for.** SA Directors who own 2-6 SA Managers and need to see the *shape* of each manager's portfolio without drowning in 50 individual deals.
- **What story it tells.** "I have two managers. Ed has more reds this week but Marisa has more stale opps. The escalation queue is a single deal — Aurora — that both teams care about. I know what I'm asking each manager about Monday."
- **Key panels.** Org-level stats, per-manager rollup cards with stacked RYG bars, cross-org escalation queue, top-10 ACV across the whole org.
- **30-second pitch.** "Same data as the Manager Dashboard, but grouped one level up. I can see Ed and Marisa side-by-side, then click into either."

## 8. `/vp` — VP Dashboard

- **What it is.** Pre-sales-wide view for the SA VP (Kevin). One card per direct-report director, plus two flagship panels: Top 10 by ACV — Path to Tech Win, and Asks of leadership.
- **Who it's for.** The SA VP. (Same UI works for any future Group VP.)
- **What story it tells.** "Across my whole org I have $12M of commit, 8 of which is at risk on path-to-tech-win. Pat's org is leaning red. The 'asks of leadership' panel is where SAs flag they need exec air cover — six items this week, all unblocked except Aurora and Helix."
- **Key panels.** Per-director rollup cards, top 10 by ACV with the explicit Path to Tech Win text Kevin keeps asking for, "Asks of leadership" sourced from `help_needed` across the whole org (escalations float to the top).
- **30-second pitch.** "The deck Kevin's chief of staff would otherwise build by hand at 11pm Sunday is right here, live, refreshed every 30 minutes."

## 9. `/sales-rvp` — Sales RVP Dashboard

- **What it is.** The sales-side mirror of `/vp`. Filter by Sales RVP (Dana for AMER, Ines for EMEA), optionally narrow further to a single AE. One card per direct-report AE, plus forecast distribution and a "Commits with tech red" panel.
- **Who it's for.** Sales Regional VPs running a forecast call. (Sales AVPs use the same page filtered up by RVP.)
- **What story it tells.** "Of my $24M commit, $4M has a red Tech Status. Those are the deals I bring to forecast call Monday — not because the AE is wrong, but because the SA flagged a tech blocker that hasn't moved. Here are the AEs who own them."
- **Key panels.** Stats bar, Forecast distribution panel (commit / upside / pipeline), per-AE rollup cards, **Commits with tech red** (the panel an RVP cares about most heading into Monday).
- **30-second pitch.** "Forecast call without 'I'll get back to you on the tech side.' Each commit deal that's tech-red has a one-line reason from the SA's last meeting note."

## 10. `/inbox` — Inbox

- **What it is.** Single inbox for *agent-generated* alerts and digests — Friday digests (per-SE and per-manager), opportunity-at-risk alerts, action-item-overdue alerts, and account-stalled alerts. Read/unread, severity, click-through to the source object.
- **Who it's for.** Anyone — alerts are routed by `owner`, so an SE only sees their own; a manager sees their team's; a director sees their org's, etc.
- **What story it tells.** "I don't have to remember to look anywhere. The agent tells me what changed, the same way Slack does."
- **Key panels.** Filter strip (severity / type / read), alert list with unread badge, embedded markdown preview of Friday digests (you can read the digest right in the inbox without leaving).
- **30-second pitch.** "Imagine if your CRM Slacked you on Friday with: 'Steve is at risk on Aurora; here's the 5-line summary of why and what to do.' That's this."

## 11. `/chat` — Chat (Beta)

- **What it is.** Embedded conversation with the **Account Intelligence Agent** — same agent that runs in Kibana Agent Builder, but inline in the app. The agent has 13 custom tools (list opportunities, what changed, account briefing, sales 1-2-3 update, etc.) and citations back to source notes.
- **Who it's for.** Everyone, but each role asks different questions.
- **What story it tells.** "All of the panels you just saw — those are *opinions*. The agent answers your *questions*. 'What's the latest on Helix?' 'Give me the 1-2-3 for Stratum.' 'Which of Marisa's deals slipped this week?' — natural language, structured answer, citations."
- **Key panels.** Chat thread with citations, sidebar showing tool calls (transparency for power users), session log.
- **30-second pitch.** "If the dashboards don't have the question you want to ask, ask it here. The agent reads from the same Elastic indices the dashboards do."

## 12. `/outbound-sfdc` — SFDC Outbound

- **What it is.** Audit log of every *outbound* agent action against Salesforce — `sfdc_update_opportunity`, `sfdc_log_call`, `sfdc_create_task`. Filterable by tool, date range, and entity. Today this is in stub mode (no live SFDC API), but the audit pipe is real and ready.
- **Who it's for.** SecOps / IT during compliance review, and the SA team lead validating that the agent only acts when it should.
- **What story it tells.** "Every time the agent writes to Salesforce, it shows up here, with full input/output. Trust through observability."
- **Key panels.** Filter strip, action list with tool-call detail expansion, status, "stub mode" banner.
- **30-second pitch.** "When we wire the SFDC API for real, this is the receipt for every action the agent takes on your behalf."

## 13. `/settings` — Settings

- **What it is.** User-scope settings (current acting user / persona / role hint), plus links to the demo data tools (reset, reseed) and a "view as" override for demos.
- **Who it's for.** Whoever's running the demo. Day-to-day this is rarely visited.
- **What story it tells.** "If a stakeholder wants to see the world from a different chair, change here once and the entire app re-skins."
- **Key panels.** Acting user, role, demo identity dropdown, reset buttons.
- **30-second pitch.** "How I switch from being Steve to being Kevin without restarting anything."

---

## How the views fit together

The pages stack by *organizational scope*. Reading down the list, the audience widens but the data is the same:

```
SA-side                                       Sales-side
─────────                                    ──────────
Personal: /notes                              /notes (AE)
Team:     /team, /accounts                    /team, /accounts
Portfolio:/risk (one row per opp)             /risk
Manager:  /manager (Ed)                       —
Director: /director (Pat)                     —
VP:       /vp (Kevin)                         —
Region:   —                                   /sales-rvp (Dana, Ines)
Area:     —                                   /sales-rvp (filtered to Regan)

Universal: /inbox (alerts), /chat (agent), /outbound-sfdc, /settings
```

Every dashboard reads from the same `opportunities` + `opportunity-rollups`
indices. There's no separate data store per role — there's one spine, and the
pages render slices of it with the right filters auto-applied.
