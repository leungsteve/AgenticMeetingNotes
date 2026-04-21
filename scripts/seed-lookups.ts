import "dotenv/config";
import { createHash } from "node:crypto";
import { errors } from "@elastic/elasticsearch";
import type { Client } from "@elastic/elasticsearch";
import { createElasticsearchClientFromEnv } from "../src/server/config/elastic-client.js";

const LOOKUP_INDEX = "granola-lookups";

function docId(type: string, value: string): string {
  return createHash("sha256").update(`${type}\0${value}`).digest("hex");
}

type LookupRow = { type: string; value: string; label: string };

function defaultLookups(): LookupRow[] {
  const rows: LookupRow[] = [];

  const accounts = ["Adobe", "Acme Corp", "Contoso", "Fabrikam", "unassigned"];
  for (const value of accounts) {
    rows.push({ type: "account", value, label: value });
  }

  const opportunities = [
    "Adobe-Search-2026Q2",
    "Acme-Platform-2026Q1",
    "Contoso-Observability-2026",
  ];
  for (const value of opportunities) {
    rows.push({ type: "opportunity", value, label: value });
  }

  const meetingTypes = [
    "discovery",
    "demo",
    "technical-review",
    "pricing",
    "internal",
    "qbr",
  ];
  for (const value of meetingTypes) {
    rows.push({
      type: "meeting_type",
      value,
      label: value.replace(/-/g, " "),
    });
  }

  const tags = [
    "demo-request",
    "pricing",
    "security",
    "competitive",
    "timeline",
    "escalation",
    "action-required",
    "migration",
    "technical",
    "has-objections",
    "has-commitments",
    "has-open-questions",
    "follow-up-scheduled",
  ];
  for (const value of tags) {
    rows.push({ type: "tag", value, label: value.replace(/-/g, " ") });
  }

  const salesStages = [
    "prospecting",
    "qualification",
    "demo",
    "poc",
    "negotiation",
    "closed-won",
    "closed-lost",
  ];
  for (const value of salesStages) {
    rows.push({
      type: "sales_stage",
      value,
      label: value.replace(/-/g, " "),
    });
  }

  return rows;
}

async function main(): Promise<void> {
  if (!process.env.ELASTIC_CLOUD_ID?.trim() || !process.env.ELASTIC_API_KEY?.trim()) {
    console.error(
      "Missing ELASTIC_CLOUD_ID or ELASTIC_API_KEY. See the Elastic Serverless Setup Guide in PROJECT_BRIEF.md.",
    );
    process.exit(1);
  }

  let client: Client;
  try {
    client = createElasticsearchClientFromEnv();
  } catch (e) {
    console.error(
      e instanceof Error ? e.message : "Failed to create Elasticsearch client.",
    );
    process.exit(1);
  }

  try {
    await client.ping();
  } catch (err) {
    console.error(
      "\nCould not reach Elasticsearch. Verify credentials and that the project is not paused.\n",
    );
    if (err instanceof errors.ResponseError) {
      console.error(`HTTP ${err.meta.statusCode}: ${err.message}`);
    } else if (err instanceof Error) {
      console.error(err.message);
    }
    process.exit(1);
  }

  const exists = await client.indices.exists({ index: LOOKUP_INDEX });
  if (!exists) {
    console.error(
      `Index "${LOOKUP_INDEX}" does not exist. Run: npm run setup:elastic`,
    );
    process.exit(1);
  }

  let created = 0;
  let skipped = 0;
  const rows = defaultLookups();

  for (const doc of rows) {
    const id = docId(doc.type, doc.value);
    try {
      await client.create({
        index: LOOKUP_INDEX,
        id,
        document: doc,
      });
      created++;
    } catch (err) {
      if (err instanceof errors.ResponseError && err.meta.statusCode === 409) {
        skipped++;
        continue;
      }
      throw err;
    }
  }

  await client.indices.refresh({ index: LOOKUP_INDEX });

  console.log("\n--- Lookup seed complete ---\n");
  console.log(`  Documents created: ${created}`);
  console.log(`  Already present (skipped): ${skipped}`);
  console.log(`  Total definitions processed: ${rows.length}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
