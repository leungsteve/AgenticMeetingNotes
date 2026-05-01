# Org structure & opportunity tiers

## Organizational hierarchy

The agent and dashboards model the following two pyramids that share a single
opportunity spine:

```
SA org:        SA   →   SA Manager   →   SA Director   →   SA VP
                      (Ed, Marisa)     (Pat Morgan)     (Kevin Qadri)
Sales org:     AE   →   Sales RVP    →   Sales AVP
                      (Dana, Ines)     (Regan Holt)
Post-sales:    CA   (sits sideways, account-scoped)
```

| Persona key | Role | Demo identity | Spine column | Page |
|---|---|---|---|---|
| `sa` / `se` | Solutions Architect (IC) | Steve, Jordan, Morgan, Alex, Taylor | `owner_se_email` | `/notes`, `/risk` |
| `manager` | SA Manager (frontline) | Ed Salazar, Marisa Chen | `manager_email` | `/manager` |
| `director` | SA Director (rolls up across SA Managers) | Pat Morgan (`pat.morgan@elastic.co`) | `director_email` | `/director` |
| `vp` | SA VP (head of pre-sales) | Kevin Qadri (`kevin.qadri@elastic.co`) | `vp_email` | `/vp` |
| `ae` | Account Executive (IC) | Priya, Marcus, Nina, Renee | `owner_ae_email` | `/risk` |
| `sales_rvp` | Sales Regional VP | Dana Fields (AMER), Ines Ortega (EMEA) | `rvp_email` | `/sales-rvp` |
| `sales_avp` | Sales Area VP | Regan Holt (`regan.holt@elastic.co`) | `avp_email` | _shares `/sales-rvp` (filter)_ |
| `ca` | Customer Architect (post-sales) | reuse SA identities | `account` | `/accounts` |

Every opportunity in `data/opportunities.csv` carries the full ladder
(`owner_se_email`, `owner_ae_email`, `manager_email`, `director_email`,
`vp_email`, `rvp_email`, `avp_email`). The dashboards group one level **down**
from the page's scope (e.g. the Director Dashboard groups by `manager_email`,
the VP Dashboard by `director_email`, the Sales RVP Dashboard by
`owner_ae_email`).

### Demo levels & how to view them

Use the **View as** picker in the top-right header to flip session identity
across all pages, or visit a level directly:

- `/manager?manager_email=ed.salazar@elastic.co` — Ed's frontline view
- `/director?director_email=pat.morgan@elastic.co` — Pat (covers Ed + Marisa)
- `/vp?vp_email=kevin.qadri@elastic.co` — Kevin's pre-sales-wide view
- `/sales-rvp?rvp_email=dana.fields@elastic.co` — Dana's AMER region
- `/sales-rvp?rvp_email=ines.ortega@elastic.co` — Ines's EMEA region

Within `/manager` there's also a thin "View at level" pivot strip that links
back up to the corresponding Director / VP page, prefilled — handy when an SA
Manager (e.g. Ed) is acting director and needs to flip levels mid-review.

# Opportunity tier definitions

`tier` is a single-character keyword (`1` | `2` | `3`) on every opportunity in
`data/opportunities.csv` and the `opportunities` Elasticsearch index. It drives
filtering and sorting on the Risk Tracker, Manager Dashboard, and the agent's
`list_opportunities` tool. Two opportunities can share an account but live in
different tiers — tier is per-opportunity, not per-account.

The shared definition below is what Ed and Kevin should be using when they
talk about "Tier 1" in a leadership review. If the SE believes a deal does not
match the rule of thumb, override the tier in the CSV — the rule is a default,
not a hard gate.

## Tier 1 — Strategic / Enterprise

The handful of opportunities that the manager personally tracks every week.

- **ACV ≥ $1M**, _or_ a Fortune-500-class anchor account, _or_ a deal that
  unlocks an entire customer's expansion plan (the "whale" account).
- Full pursuit-team coverage (SE + AE + manager + named exec sponsor).
- Manager reviews RYG and Path to Tech Win **weekly**.
- Any red here is an immediate escalation candidate.
- Examples in the demo data: Aurora Security ($1.85M), Helix Platform ($2.4M),
  Quantum Trading Floor ($1.65M), Meridian Serverless ($1.1M).

## Tier 2 — Major / Growth

The "in-plan-year" deals — large enough to matter, small enough that the
manager only needs to see exceptions.

- **ACV between $250K and $999K**, healthy momentum, expected to close inside
  the current plan year.
- SE owns the day-to-day; manager scans **bi-weekly**.
- Yellow at commit category bumps to a Tier-1-style review for one cycle.
- Examples: Helix Migration ($680K), Polaris SIEM ($950K), Stratum
  Observability ($575K), Summit Splunk Migration ($890K).

## Tier 3 — Pipeline / Long-tail

Early-stage or low-touch deals that should not crowd the manager's inbox.

- **ACV < $250K**, _or_ in qualification / prospecting, _or_ a low-touch
  expansion play.
- SE owns end-to-end; manager looks only when the SE flags a help-needed.
- Aging Tier-3 (no meeting in 30+ days) appears in the **Hygiene Gaps**
  panel only — never in the escalation queue.
- Examples: Lattice Site Search ($140K), Redwood Logistics ($165K),
  Harbor Editorial AI Search ($180K).

## Decision rule of thumb (when in doubt)

```
if acv >= 1_000_000 OR strategic_anchor:    Tier 1
elif acv >= 250_000:                        Tier 2
else:                                       Tier 3
```

Tier should be **stable across a quarter** unless the deal materially changes
(scope expansion, slip, exec-level ownership change). Don't downgrade a Tier-1
just because it slipped to next quarter — the strategic value did not change.

## Operational consequences

| Surface | Tier 1 | Tier 2 | Tier 3 |
|---|---|---|---|
| Manager Dashboard panel | Always shown | Shown when red/yellow | Shown only in hygiene gaps |
| Friday digest depth | Full per-opp section | Per-opp if state changed | Aggregate count only |
| Agent default scope | Always included | Always included | Included on explicit ask |
| Escalation severity floor | `medium` (red → `high`) | `low` (red → `medium`) | `low` |

## How to change a tier

Edit `data/opportunities.csv` and re-run:

```bash
npm run seed:opportunities
```

The Manager Dashboard, Risk Tracker, and agent will pick up the new tier on
the next request — no Elastic re-index needed beyond the opportunity spine.
