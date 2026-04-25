/**
 * setup-kibana-agent.ts
 * 
 * Creates/updates the Account Intelligence Agent in Kibana Agent Builder,
 * including all ES|QL tools and the full system instructions.
 * 
 * Run: npm run setup:kibana-agent
 * 
 * Requires: ELASTIC_CLOUD_ID (or URL) and ELASTIC_API_KEY in .env
 * The Kibana URL is derived automatically from the Elasticsearch URL.
 */
import "dotenv/config";

const ES_URL = (process.env.ELASTIC_CLOUD_ID ?? "").trim();
if (!ES_URL || !process.env.ELASTIC_API_KEY) {
  console.error("Missing ELASTIC_CLOUD_ID or ELASTIC_API_KEY");
  process.exit(1);
}

// Derive Kibana URL from ES URL (agenticnotes-XXXXX.es. → agenticnotes-XXXXX.kb.)
const KIBANA_URL = ES_URL.replace(/^(https?:\/\/[^.]+)\.es\./, "$1.kb.").replace(/:443$/, "");
const API_KEY = process.env.ELASTIC_API_KEY;

const HEADERS = {
  "Authorization": `ApiKey ${API_KEY}`,
  "kbn-xsrf": "true",
  "Content-Type": "application/json",
};

interface KbnResponse {
  statusCode?: number;
  message?: string;
  id?: string;
  name?: string;
  version?: { number?: string };
  configuration?: {
    instructions?: string;
    tools?: unknown[];
  };
  [key: string]: unknown;
}

async function kbn(method: string, path: string, body?: unknown): Promise<KbnResponse> {
  const res = await fetch(`${KIBANA_URL}${path}`, {
    method,
    headers: HEADERS,
    body: body ? JSON.stringify(body) : undefined,
  });
  return (await res.json()) as KbnResponse;
}

const ESQL_TOOLS = [
  {
    id: "aia.get-account-rollup",
    description: "Get the pre-computed rollup summary for an account: meeting count, last meeting date, open action items, sentiment, competitors seen, and momentum score.",
    query: "FROM account-rollups | WHERE account == ?account | KEEP account, meeting_count, last_meeting_date, first_meeting_date, open_action_items, overdue_action_items, competitors_seen, latest_sentiment, momentum_score, computed_at",
    params: { account: { type: "string", description: "Exact account name" } },
  },
  {
    id: "aia.get-meeting-timeline",
    description: "Get chronological list of meetings for an account with dates, titles, author roles, sentiment, and tags.",
    query: "FROM granola-meeting-notes | WHERE account == ?account | SORT meeting_date DESC | LIMIT 20 | KEEP note_id, meeting_date, title, author_name, author_role, meeting_type, tags, customer_sentiment.overall, summary",
    params: { account: { type: "string", description: "Exact account name" } },
  },
  {
    id: "aia.search-notes-by-account",
    description: "Get recent meeting notes for an account: summary, key topics, decisions, technical environment, competitive landscape, budget signals, and sentiment. Note: nested fields (action_items, commitments) require platform.core.get_document_by_id for full detail.",
    query: "FROM granola-meeting-notes | WHERE account == ?account | SORT meeting_date DESC | LIMIT 8 | KEEP note_id, meeting_date, title, author_name, author_role, meeting_type, summary, key_topics, decisions_made, open_questions, technical_environment.current_stack, technical_environment.pain_points, technical_environment.requirements, technical_environment.constraints, technical_environment.scale, technical_environment.integrations, competitive_landscape.incumbent, competitive_landscape.competitors_evaluating, competitive_landscape.mentions, competitive_landscape.differentiators, budget_timeline.budget, budget_timeline.timeline, budget_timeline.procurement, budget_timeline.stage_signals, customer_sentiment.overall, customer_sentiment.concerns, customer_sentiment.objections, customer_sentiment.champion_signals, next_meeting.date, next_meeting.agenda, tags, sales_stage",
    params: { account: { type: "string", description: "Account name" } },
  },
  {
    id: "aia.list-open-action-items",
    description: "List open action items for an account. Shows description, owner, due date, and source meeting.",
    query: 'FROM action-items | WHERE account == ?account AND status == "open" | SORT due_date ASC | LIMIT 50 | KEEP source_note_id, account, meeting_date, meeting_title, description, owner, due_date, status',
    params: { account: { type: "string", description: "Account name" } },
  },
  {
    id: "aia.get-pursuit-team",
    description: "Get the pursuit team doc for an account. Returns account metadata and notes. Use platform.core.get_document_by_id with index=account-pursuit-team and id=<account> to see the full nested members list (AE/SA/CA names, emails, roles).",
    query: "FROM account-pursuit-team | WHERE account == ?account | KEEP account, account_display, notes, updated_at, updated_by",
    params: { account: { type: "string", description: "Account name" } },
  },
  {
    id: "aia.list-all-accounts",
    description: "List all accounts with rollup stats (meeting count, last meeting, open action items, sentiment, momentum). Use for pipeline coverage or finding at-risk accounts.",
    query: "FROM account-rollups | SORT momentum_score ASC | LIMIT 100 | KEEP account, meeting_count, last_meeting_date, open_action_items, overdue_action_items, latest_sentiment, momentum_score",
    params: {},
  },
  {
    id: "aia.list-alerts",
    description: "List agent-generated alerts for an owner: overdue action items, stale accounts, at-risk sentiment flags.",
    query: 'FROM agent-alerts | WHERE owner == ?owner AND read == false | SORT created_at DESC | LIMIT 25 | KEEP alert_type, account, severity, message, created_at',
    params: { owner: { type: "string", description: "Email of the alert owner" } },
  },
  {
    id: "aia.get-commitments",
    description: "Find meeting notes where our team made commitments to an account (tagged has-commitments). Returns title, date, and summary. Use platform.core.get_document_by_id with index=granola-meeting-notes for the full nested commitments field.",
    query: 'FROM granola-meeting-notes | WHERE account == ?account AND tags == "has-commitments" | SORT meeting_date DESC | LIMIT 20 | KEEP note_id, meeting_date, title, author_name, author_role, summary, decisions_made',
    params: { account: { type: "string", description: "Account name" } },
  },
  {
    id: "aia.flag-at-risk-accounts",
    description: "Find accounts that are at risk: negative sentiment (concerned or skeptical) OR momentum_score below zero (stale or poor engagement).",
    query: 'FROM account-rollups | WHERE latest_sentiment IN ("concerned", "skeptical") OR momentum_score < 0 | SORT momentum_score ASC | LIMIT 20 | KEEP account, latest_sentiment, momentum_score, last_meeting_date, open_action_items, overdue_action_items',
    params: {},
  },
  {
    id: "aia.get-competitors",
    description: "Get competitors being evaluated by an account from the pre-computed rollup.",
    query: "FROM account-rollups | WHERE account == ?account | KEEP account, competitors_seen",
    params: { account: { type: "string", description: "Account name" } },
  },
  // ── SA 1-2-3 Salesforce update tools ─────────────────────────────────────
  {
    id: "aia.get-sa-this-week",
    description: "Fetch meetings for an account in the last 7 days. First leg of the SA 1-2-3 Salesforce update: What did we do this week? Optionally filter by opportunity name.",
    query: "FROM granola-meeting-notes | WHERE account == ?account AND meeting_date >= NOW() - 7 days | SORT meeting_date DESC | LIMIT 10 | KEEP meeting_date, title, meeting_type, author_name, author_role, summary, decisions_made, tags, sales_stage, customer_sentiment.overall",
    params: { account: { type: "string", description: "Account name, e.g. Meridian Systems" } },
  },
  {
    id: "aia.get-sa-open-items",
    description: "List all open action items for an account. Second leg of the SA 1-2-3 Salesforce update: What are we planning to do next? Returns description, owner, and due date sorted soonest-first.",
    query: 'FROM action-items | WHERE account == ?account AND status == "open" | SORT due_date ASC | LIMIT 20 | KEEP meeting_date, meeting_title, description, owner, due_date, status',
    params: { account: { type: "string", description: "Account name" } },
  },
  {
    id: "aia.get-sa-tech-win-status",
    description: "Get the most recent meeting notes for an account to assess tech win status. Third leg of the SA 1-2-3 Salesforce update: Do we have the tech win and why? Evaluate sales_stage, customer_sentiment.overall, decisions_made, open_questions, and tags to determine status.",
    query: "FROM granola-meeting-notes | WHERE account == ?account | SORT meeting_date DESC | LIMIT 5 | KEEP meeting_date, title, sales_stage, customer_sentiment.overall, decisions_made, open_questions, technical_environment.pain_points, technical_environment.requirements, tags",
    params: { account: { type: "string", description: "Account name" } },
  },
  // ── Opportunity-spine tools (CSV-seeded `opportunities` index + worker-computed `opportunity-rollups`) ──
  {
    id: "aia.get-opportunity",
    description: "Get the opportunity spine row (account, opp_name, ACV, close_quarter, forecast_category, owner SE/AE, manager, tier).",
    query: "FROM opportunities | WHERE opp_id == ?opp_id | KEEP opp_id, account, opp_name, acv, close_quarter, forecast_category, sales_stage, owner_se_email, owner_ae_email, manager_email, tier",
    params: { opp_id: { type: "string", description: "Opportunity id" } },
  },
  {
    id: "aia.get-opportunity-rollup",
    description: "Get the worker-computed rollup for an opportunity: Tech Status RYG, reason, Path to Tech Win, next milestone, what changed, escalation flag, last meeting.",
    query: "FROM opportunity-rollups | WHERE opp_id == ?opp_id | KEEP opp_id, account, opp_name, acv, forecast_category, owner_se_email, manager_email, tech_status, tech_status_reason, path_to_tech_win, next_milestone.date, next_milestone.description, what_changed, help_needed, last_meeting_date, open_action_items, overdue_action_items, escalation_recommended, escalation_severity, computed_at",
    params: { opp_id: { type: "string", description: "Opportunity id" } },
  },
  {
    id: "aia.list-opportunities-by-manager",
    description: "List all opportunities for one manager's team, sorted by ACV desc. Use to scope a Manager Dashboard view.",
    query: "FROM opportunity-rollups | WHERE manager_email == ?manager_email | SORT acv DESC | LIMIT 200 | KEEP opp_id, account, opp_name, acv, forecast_category, owner_se_email, tech_status, last_meeting_date, escalation_recommended",
    params: { manager_email: { type: "string", description: "Manager email (e.g. ed.salazar@elastic.co)" } },
  },
  {
    id: "aia.list-opportunities-by-se",
    description: "List all opportunities owned by one SE, sorted by ACV desc. Use for SE-level digests and 1-2-3 generation.",
    query: "FROM opportunity-rollups | WHERE owner_se_email == ?owner_se_email | SORT acv DESC | LIMIT 100 | KEEP opp_id, account, opp_name, acv, forecast_category, tech_status, tech_status_reason, path_to_tech_win, last_meeting_date, escalation_recommended",
    params: { owner_se_email: { type: "string", description: "SE email" } },
  },
  {
    id: "aia.list-red-opportunities",
    description: "Every red opportunity (optionally scoped by manager). Sorted by ACV desc. Manager Dashboard panel + Friday digest source.",
    query: 'FROM opportunity-rollups | WHERE tech_status == "red" AND (manager_email == ?manager_email OR ?manager_email == "") | SORT acv DESC | LIMIT 200 | KEEP opp_id, account, opp_name, acv, forecast_category, owner_se_email, manager_email, tech_status_reason, path_to_tech_win, escalation_recommended, escalation_severity',
    params: { manager_email: { type: "string", description: "Manager email; pass empty string to span all teams" } },
  },
  {
    id: "aia.list-top-opportunities-by-acv",
    description: "Top 10 opportunities by ACV with their RYG. Optional manager scope. Default Manager Dashboard panel.",
    query: 'FROM opportunity-rollups | WHERE manager_email == ?manager_email OR ?manager_email == "" | SORT acv DESC | LIMIT 10 | KEEP opp_id, account, opp_name, acv, forecast_category, owner_se_email, tech_status, path_to_tech_win, last_meeting_date',
    params: { manager_email: { type: "string", description: "Manager email; empty string spans all" } },
  },
  {
    id: "aia.list-escalations",
    description: "Every opportunity with escalation_recommended == true (red AND commit OR red AND ACV >= 1M). The exec escalation queue.",
    query: "FROM opportunity-rollups | WHERE escalation_recommended == true | SORT acv DESC | LIMIT 50 | KEEP opp_id, account, opp_name, acv, forecast_category, owner_se_email, manager_email, tech_status_reason, path_to_tech_win, escalation_severity",
    params: {},
  },
  {
    id: "aia.list-stale-opportunities",
    description: "Opportunities with no meeting in the last 7 days (hygiene gap). Use for the manager hygiene leaderboard.",
    query: "FROM opportunity-rollups | WHERE last_meeting_date < NOW() - 7 days OR last_meeting_date IS NULL | SORT acv DESC | LIMIT 100 | KEEP opp_id, account, opp_name, acv, owner_se_email, manager_email, last_meeting_date",
    params: {},
  },
];

const INSTRUCTIONS = `You are the Account Intelligence Agent for a pre-sales account team at Elastic. You have access to structured meeting notes, pursuit team rosters, account rollups, action items, and alert data stored in Elasticsearch.

## Your Elasticsearch Indices

- **granola-meeting-notes** — Full meeting notes. Key fields: note_id, account (keyword), meeting_date, title, author_name, author_role, author_email, meeting_type, summary, key_topics, decisions_made, open_questions, transcript, technical_environment.current_stack / pain_points / requirements / constraints / scale / integrations, action_items (nested: description, owner, due_date, status), commitments (nested: description, committed_by, timeline), customer_sentiment.overall (keyword: enthusiastic/positive/neutral/cautious/concerned/skeptical), competitive_landscape.competitors_evaluating / incumbent / mentions, budget_timeline.budget / timeline / procurement / stage_signals, tags (keyword[]), sales_stage, attendee_names (keyword[], email addresses)
- **account-rollups** — Pre-computed per-account summaries. Fields: account, meeting_count, last_meeting_date, open_action_items, overdue_action_items, competitors_seen (keyword[]), latest_sentiment, momentum_score (float, higher=better)
- **account-pursuit-team** — Pursuit team roster per account. Fields: account, members (nested: email, name, role AE/SA/CA). Note: members is nested — use platform.core.get_document_by_id to read full roster.
- **action-items** — Denormalized action items. Fields: source_note_id, account, meeting_date, meeting_title, description, owner (email), due_date, status (open/done)
- **agent-alerts** — Agent alerts. Fields: alert_type, account, owner, severity (low/medium/high), message, read (boolean). For opportunity_at_risk alerts, severity == "high" means the opportunity is red AND (forecast_category == commit OR acv >= $1M) — those are escalations.
- **opportunities** — CSV-seeded opportunity spine (stand-in for Salesforce + Clari while no API access exists). Fields: opp_id, account, opp_name, acv, close_quarter, forecast_category (commit/upside/pipeline/omitted), sales_stage, owner_se_email, owner_ae_email, manager_email, tier (1/2/3).
- **opportunity-rollups** — Worker-computed per-opportunity rollups. Fields: opp_id, account, opp_name, acv, forecast_category, owner_se_email, manager_email, tech_status (red/yellow/green), tech_status_reason, path_to_tech_win, next_milestone.{date,description}, what_changed, help_needed, last_meeting_date, open_action_items, overdue_action_items, escalation_recommended (boolean), escalation_severity, computed_at.

## Persona Behaviour

**Account Executive (AE):** Lead with deal stage, stakeholder map (role_flag: decision_maker/champion/blocker), competitive intel, budget/timeline signals, overdue action items, next steps. Be decisive and actionable.

**Solutions Architect (SA) - Pre-sales:** Focus on technical_environment (current_stack, pain_points, requirements, constraints, scale), POC/demo requests, architecture decisions, competitive technical positioning, and open technical questions. Quote specific field values. Generate 1-2-3 Salesforce updates on request.

**Customer Architect (CA) - Post-sales:** Focus on commitments made during pre-sales (what was promised and when), technical decisions that shaped the implementation, open post-sales action items, adoption blockers, and expansion use cases surfacing in recent meetings. When onboarding to a new account, retrieve the full pre-sales meeting history and commitments first.

**Leader:** Default to rollup-level answers. Use aia.list-all-accounts and aia.flag-at-risk-accounts first. Only drill into raw notes when asked.

**Solutions Engineer (SE) - opportunity-scoped:** Default to opportunity-level answers. Lead with Tech Status RYG and Path to Tech Win. Use aia.get-opportunity, aia.get-opportunity-rollup, and aia.list-opportunities-by-se. For 1-2-3 updates the SE wants opp_id-scoped output, not account-scoped.

**SA Manager (Ed):** Surface exceptions, not lists. Use aia.list-red-opportunities, aia.list-top-opportunities-by-acv, aia.list-escalations, aia.list-stale-opportunities — pass manager_email to scope to the team. Never paste >10 raw opportunity rows; summarize.

**Director (Miguel) / Kevin:** Per-manager rollup, then top-10 org-wide. Always quote path_to_tech_win and what_changed; never paste raw note text.

## SA 1-2-3 Salesforce Update

When asked for a "1-2-3", "1-2-3 update", "Salesforce update", or "weekly update" for an account or opportunity, call all three tools IN PARALLEL using the account name:
- aia.get-sa-this-week (account)
- aia.get-sa-open-items (account)
- aia.get-sa-tech-win-status (account)

Do NOT ask for an email address. The update is scoped to the account or opportunity only. If an opportunity name is given instead of an account, resolve the account name first.

Format the output as three clearly labelled sections. Each section must be exactly 2-3 sentences. No bullet points. Write in the past tense for section 1, present/future tense for section 2, and a direct assertion for section 3. The SA should be able to copy and paste the output directly into Salesforce.

## Tool Usage Priority

1. **aia.get-account-rollup** — First stop for any account question (fast, pre-computed)
2. **aia.search-notes-by-account** — Detailed note content
3. **aia.get-meeting-timeline** — Chronological meeting history
4. **aia.list-open-action-items** — What is overdue / what do we owe the customer (by account)
5. **aia.list-all-accounts** — Pipeline coverage
6. **aia.flag-at-risk-accounts** — Negative sentiment or momentum_score < 0
7. **aia.get-pursuit-team** — Who owns an account
8. **aia.get-commitments** — What did we promise the customer
9. **aia.get-competitors** — Vendors being evaluated
10. **aia.list-alerts** — Active alerts for an owner
11. **aia.get-sa-this-week** — SA weekly activity (1-2-3 update leg 1)
12. **aia.get-sa-open-items** — SA open items across all accounts (1-2-3 update leg 2)
13. **aia.get-sa-tech-win-status** — SA tech win assessment (1-2-3 update leg 3)
14. **aia.get-opportunity** + **aia.get-opportunity-rollup** — Opportunity-scoped Tech Status RYG and Path to Tech Win
15. **aia.list-opportunities-by-se** — One SE's portfolio
16. **aia.list-opportunities-by-manager** — One manager's team
17. **aia.list-red-opportunities** / **aia.list-escalations** / **aia.list-top-opportunities-by-acv** / **aia.list-stale-opportunities** — Manager Dashboard panels
18. **platform.core.search** — Free-form search
19. **platform.core.execute_esql** — Ad-hoc ES|QL queries
20. **platform.core.get_document_by_id** — Fetch specific note by note_id (index: granola-meeting-notes), opportunity by opp_id (index: opportunities), or opportunity rollup by opp_id (index: opportunity-rollups)

## Citation Format
Always cite source notes: [Meeting: {title} — {YYYY-MM-DD} by {author_role}] | note_id: {note_id}

## Defaults
- Time window: all time unless specified
- SFDC is in stub mode — acknowledge and tell user to enter manually
- For 1-2-3 updates: if the SA does not provide their email, ask for it once`;

async function upsertTool(tool: typeof ESQL_TOOLS[0]) {
  const updateBody = {
    description: tool.description,
    configuration: { query: tool.query, params: tool.params },
  };
  // Try PUT first (update existing — no id or type in body, id is in URL path)
  let res = await kbn("PUT", `/api/agent_builder/tools/${tool.id}`, updateBody);
  if (res.statusCode === 404) {
    // Create new — id and type go in body for POST
    res = await kbn("POST", "/api/agent_builder/tools", { id: tool.id, type: "esql", ...updateBody });
  }
  return "id" in res ? "ok" : (res.message as string | undefined)?.slice(0, 80) ?? "error";
}

async function main() {
  console.log(`\nKibana: ${KIBANA_URL}\n`);

  // Verify connectivity
  const status = await kbn("GET", "/api/status");
  if (status.statusCode) {
    console.error("Cannot reach Kibana:", status.message);
    process.exit(1);
  }
  console.log(`Kibana ${status.version?.number ?? "?"} — connected\n`);

  // Upsert ES|QL tools
  console.log("Upserting ES|QL tools:");
  for (const tool of ESQL_TOOLS) {
    const result = await upsertTool(tool);
    console.log(`  ${result === "ok" ? "✓" : "✗"} ${tool.id}${result !== "ok" ? " — " + result : ""}`);
  }

  // Build tools config
  const toolsConfig = [
    ...ESQL_TOOLS.map(t => ({ tool_ids: [t.id] })),
    { tool_ids: ["platform.core.search", "platform.core.execute_esql", "platform.core.get_document_by_id", "platform.core.get_index_mapping"] },
  ];

  // Upsert agent
  const agentBody = {
    name: "Account Intelligence Agent",
    description: "Pre-sales account intelligence for AE, SA/CA, and Leaders. Searches meeting notes, rollups, action items, pursuit team data, and alerts.",
    configuration: {
      instructions: INSTRUCTIONS,
      tools: toolsConfig,
      skill_ids: [],
      enable_elastic_capabilities: false,
    },
  };

  console.log("\nUpserting agent:");
  let agentRes = await kbn("PUT", "/api/agent_builder/agents/account-intelligence-agent", agentBody);
  if (agentRes.statusCode === 404) {
    agentRes = await kbn("POST", "/api/agent_builder/agents", { id: "account-intelligence-agent", ...agentBody });
  }

  if (agentRes.id) {
    console.log(`  ✓ Agent '${agentRes.name ?? agentRes.id}' ready`);
    console.log(`  Tools: ${agentRes.configuration?.tools?.length ?? 0} groups`);
    console.log(`  Instructions: ${agentRes.configuration?.instructions?.length ?? 0} chars`);
    console.log(`\n  Open Kibana → Agents to find it\n`);
  } else {
    console.error("  ✗ Agent upsert failed:", JSON.stringify(agentRes).slice(0, 200));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
