/**
 * reset-demo
 *
 * Wipes the demo data so you can re-run `npm run demo:all` from a clean
 * slate. This deletes documents from the data indices but leaves the index
 * mappings, ingest pipeline, and Kibana agent configuration untouched.
 *
 * Indices touched:
 *   - granola-meeting-notes      (only docs from the seed-demo-notes script)
 *   - action-items               (only docs from the seed-demo-notes script)
 *   - account-rollups            (all)
 *   - opportunity-rollups        (all)
 *   - agent-alerts               (all)
 *   - opportunities              (all — re-seeded from CSV)
 *   - account-pursuit-team       (all — re-derived from CSV by seed-opportunities)
 *   - granola-lookups            (all — re-seeded from seed-lookups)
 *
 * Pass --full to also delete every document in granola-meeting-notes and
 * action-items (use with care; nukes any real notes you may have ingested).
 */
import "dotenv/config";
import { errors } from "@elastic/elasticsearch";
import { createElasticsearchClientFromEnv } from "../src/server/config/elastic-client.js";
import {
  ACTION_ITEMS_INDEX,
  AGENT_ALERTS_INDEX,
  LOOKUPS_INDEX,
  NOTES_INDEX,
  OPPORTUNITIES_INDEX,
  OPPORTUNITY_ROLLUPS_INDEX,
  PURSUIT_TEAM_INDEX,
  ROLLUPS_INDEX,
} from "../src/server/constants/elastic.js";

const FULL = process.argv.includes("--full");

const DEMO_GROUP_PREFIX = "demo-";

async function main(): Promise<void> {
  if (!process.env.ELASTIC_CLOUD_ID?.trim() || !process.env.ELASTIC_API_KEY?.trim()) {
    console.error("Missing ELASTIC_CLOUD_ID or ELASTIC_API_KEY.");
    process.exit(1);
  }
  const client = createElasticsearchClientFromEnv();

  try {
    await client.ping();
  } catch (err) {
    console.error("Could not reach Elasticsearch.");
    if (err instanceof errors.ResponseError) console.error(err.message);
    process.exit(1);
  }

  const targets: Array<{ index: string; query: object; label: string }> = [
    { index: ROLLUPS_INDEX, query: { match_all: {} }, label: "account-rollups" },
    { index: OPPORTUNITY_ROLLUPS_INDEX, query: { match_all: {} }, label: "opportunity-rollups" },
    { index: AGENT_ALERTS_INDEX, query: { match_all: {} }, label: "agent-alerts" },
    { index: OPPORTUNITIES_INDEX, query: { match_all: {} }, label: "opportunities" },
    { index: PURSUIT_TEAM_INDEX, query: { match_all: {} }, label: "account-pursuit-team" },
    { index: LOOKUPS_INDEX, query: { match_all: {} }, label: "granola-lookups" },
  ];

  if (FULL) {
    targets.push({ index: NOTES_INDEX, query: { match_all: {} }, label: "granola-meeting-notes (FULL)" });
    targets.push({ index: ACTION_ITEMS_INDEX, query: { match_all: {} }, label: "action-items (FULL)" });
  } else {
    targets.push({
      index: NOTES_INDEX,
      query: { prefix: { meeting_group_id: DEMO_GROUP_PREFIX } },
      label: `granola-meeting-notes (meeting_group_id starts with "${DEMO_GROUP_PREFIX}")`,
    });
    targets.push({
      index: ACTION_ITEMS_INDEX,
      query: { match_all: {} },
      label: "action-items",
    });
  }

  for (const { index, query, label } of targets) {
    try {
      const res = await client.deleteByQuery({
        index,
        query: query as never,
        refresh: true,
        conflicts: "proceed",
      });
      console.log(`  ✓ ${label}: ${res.deleted ?? 0} document(s) deleted`);
    } catch (err) {
      if (err instanceof errors.ResponseError && err.meta.statusCode === 404) {
        console.log(`  · ${label}: index not found, skipping`);
      } else if (err instanceof Error) {
        console.error(`  ✗ ${label}: ${err.message}`);
      }
    }
  }

  console.log("\nReset complete. To re-seed from clean: npm run demo:all\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
