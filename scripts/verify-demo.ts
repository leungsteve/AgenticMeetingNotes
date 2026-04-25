/**
 * verify-demo
 *
 * Quick sanity-check after running `npm run demo:all`. Prints document counts,
 * the per-opportunity rollup table (with RYG, forecast, ACV, escalation), the
 * high-severity opportunity-at-risk alerts, and any Friday digest alerts.
 *
 * Usage: npm run verify:demo
 */
import "dotenv/config";
import { createElasticsearchClientFromEnv } from "../src/server/config/elastic-client.js";

const c = createElasticsearchClientFromEnv();

async function showCount(label: string, index: string): Promise<void> {
  try {
    const res = await c.count({ index });
    console.log(`  ${label.padEnd(28)} ${String(res.count).padStart(4)} docs`);
  } catch {
    console.log(`  ${label.padEnd(28)}    -`);
  }
}

console.log("\n--- Demo data verification ---\n");
console.log("Document counts:");
await showCount("granola-meeting-notes", "granola-meeting-notes");
await showCount("opportunities", "opportunities");
await showCount("opportunity-rollups", "opportunity-rollups");
await showCount("account-rollups", "account-rollups");
await showCount("action-items", "action-items");
await showCount("agent-alerts", "agent-alerts");

console.log("\nOpportunity rollups (RYG / forecast / acv / escalation):");
const rolls = await c.search({
  index: "opportunity-rollups",
  size: 50,
  sort: [{ acv: { order: "desc" } }],
} as never);
const rows = (rolls as { hits: { hits: Array<{ _source: Record<string, unknown> }> } }).hits.hits;
for (const h of rows) {
  const s = h._source as Record<string, unknown>;
  const status = String(s.tech_status ?? "—");
  const fc = String(s.forecast_category ?? "—");
  const acv = Number(s.acv ?? 0);
  const escal = s.escalation_recommended ? `[ESCAL ${String(s.escalation_severity)}]` : "";
  const id = String(s.opp_id);
  console.log(
    `  ${id.padEnd(28)} ${status.padEnd(7)} ${fc.padEnd(10)} $${(acv / 1000).toFixed(0).padStart(5)}K  ${escal}`,
  );
}

console.log("\nHigh-severity opportunity-at-risk alerts:");
const alerts = await c.search({
  index: "agent-alerts",
  size: 20,
  query: {
    bool: {
      filter: [
        { term: { alert_type: "opportunity_at_risk" } },
        { term: { severity: "high" } },
      ],
    },
  } as never,
} as never);
const aHits = (alerts as { hits: { hits: Array<{ _source: Record<string, unknown> }> } }).hits.hits;
for (const h of aHits) {
  const s = h._source as Record<string, unknown>;
  console.log(`  - ${String(s.account ?? "—")}: ${String(s.message ?? "")}`);
}

console.log("\nFriday digests in inbox:");
const digests = await c.search({
  index: "agent-alerts",
  size: 20,
  query: {
    terms: { alert_type: ["friday_digest", "friday_digest_manager"] },
  } as never,
  sort: [{ created_at: { order: "desc" } }],
} as never);
const dHits = (digests as { hits: { hits: Array<{ _source: Record<string, unknown> }> } }).hits.hits;
for (const h of dHits) {
  const s = h._source as Record<string, unknown>;
  console.log(`  - [${String(s.alert_type)}] ${String(s.owner ?? "—")}: ${String(s.message ?? "")}`);
}

console.log("\n--- end ---\n");
