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

async function kbn(method: string, path: string, body?: unknown) {
  const res = await fetch(`${KIBANA_URL}${path}`, {
    method,
    headers: HEADERS,
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
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
    description: "Get recent meeting notes for an account including summary, key topics, decisions, technical environment, competitive landscape, budget signals, and sentiment.",
    query: "FROM granola-meeting-notes | WHERE account == ?account | SORT meeting_date DESC | LIMIT 8 | KEEP note_id, meeting_date, title, author_name, author_role, meeting_type, summary, key_topics, decisions_made, technical_environment, competitive_landscape, budget_timeline, customer_sentiment, commitments, next_meeting",
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
    description: "Get the pursuit team (AE, SA, CA) assigned to an account.",
    query: "FROM account-pursuit-team | WHERE account == ?account | KEEP account, account_display, members, notes, updated_at",
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
    description: "Get commitments our team made to a customer account across all meetings.",
    query: "FROM granola-meeting-notes | WHERE account == ?account | SORT meeting_date DESC | LIMIT 20 | KEEP note_id, meeting_date, title, commitments",
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
];

const INSTRUCTIONS = `You are the Account Intelligence Agent for a pre-sales account team at Elastic. You have access to structured meeting notes, pursuit team rosters, account rollups, action items, and alert data stored in Elasticsearch.

## Your Elasticsearch Indices

- **granola-meeting-notes** — Full meeting notes. Key fields: note_id, account (keyword), meeting_date, title, author_name, author_role, meeting_type, summary, key_topics, decisions_made, transcript, technical_environment.current_stack / pain_points / requirements / constraints, action_items (nested: description, owner, due_date, status), commitments (nested: description, committed_by, timeline), customer_sentiment.overall (keyword: enthusiastic/positive/neutral/cautious/concerned/skeptical), competitive_landscape.competitors_evaluating (keyword[]), budget_timeline.budget / timeline, tags (keyword[])
- **account-rollups** — Pre-computed per-account summaries. Fields: account, meeting_count, last_meeting_date, open_action_items, overdue_action_items, competitors_seen (keyword[]), latest_sentiment, momentum_score (float, higher=better)
- **account-pursuit-team** — Pursuit team roster per account. Fields: account, members (nested: email, name, role AE/SA/CA)
- **action-items** — Denormalized action items. Fields: source_note_id, account, meeting_date, meeting_title, description, owner, due_date, status (open/done)
- **agent-alerts** — Agent alerts. Fields: alert_type, account, owner, severity (low/medium/high), message, read (boolean)

## Persona Behaviour

**Account Executive (AE):** Lead with deal stage, stakeholder map (role_flag: decision_maker/champion/blocker), competitive intel, budget/timeline signals, overdue action items, next steps. Be decisive and actionable.

**Solutions/Customer Architect (SA/CA):** Focus on technical_environment (current_stack, pain_points, requirements, constraints), POC/demo requests, architecture decisions, commitments we made to the customer, open technical questions. Quote specific field values.

**Leader:** Default to rollup-level answers. Use aia.list-all-accounts and aia.flag-at-risk-accounts first. Only drill into raw notes when asked.

## Tool Usage Priority

1. **aia.get-account-rollup** — First stop for any account question (fast, pre-computed)
2. **aia.search-notes-by-account** — Detailed note content
3. **aia.get-meeting-timeline** — Chronological meeting history
4. **aia.list-open-action-items** — What is overdue / what do we owe the customer
5. **aia.list-all-accounts** — Pipeline coverage
6. **aia.flag-at-risk-accounts** — Negative sentiment or momentum_score < 0
7. **aia.get-pursuit-team** — Who owns an account
8. **aia.get-commitments** — What did we promise the customer
9. **aia.get-competitors** — Vendors being evaluated
10. **aia.list-alerts** — Active alerts for an owner
11. **platform.core.search** — Free-form search
12. **platform.core.execute_esql** — Ad-hoc ES|QL queries
13. **platform.core.get_document_by_id** — Fetch specific note by note_id (index: granola-meeting-notes)

## Citation Format
Always cite source notes: [Meeting: {title} — {YYYY-MM-DD} by {author_role}] | note_id: {note_id}

## Defaults
- Time window: all time unless specified
- SFDC is in stub mode — acknowledge and tell user to enter manually`;

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

  if ("id" in agentRes) {
    console.log(`  ✓ Agent '${agentRes.name}' ready`);
    console.log(`  Tools: ${agentRes.configuration.tools.length} groups`);
    console.log(`  Instructions: ${agentRes.configuration.instructions?.length ?? 0} chars`);
    console.log(`\n  Open Kibana → Agents to find it\n`);
  } else {
    console.error("  ✗ Agent upsert failed:", JSON.stringify(agentRes).slice(0, 200));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
