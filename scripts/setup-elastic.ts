import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { errors } from "@elastic/elasticsearch";
import type { Client } from "@elastic/elasticsearch";
import { createElasticsearchClientFromEnv } from "../src/server/config/elastic-client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_DIR = path.resolve(__dirname, "../src/server/config");

const INDICES = [
  "granola-meeting-notes",
  "granola-sync-state",
  "granola-lookups",
] as const;

type IndexName = (typeof INDICES)[number];

function loadJson<T>(filename: string): T {
  const full = path.join(CONFIG_DIR, filename);
  return JSON.parse(readFileSync(full, "utf8")) as T;
}

async function testConnection(client: Client): Promise<void> {
  try {
    await client.ping();
  } catch (err) {
    console.error(
      "\nCould not reach Elasticsearch. Check the following:\n" +
        "  • ELASTIC_CLOUD_ID is either your Cloud ID (name:base64…) or cluster HTTPS URL, and ELASTIC_API_KEY is correct\n" +
        "  • The Serverless project is active (not paused) at cloud.elastic.co\n" +
        "  • This machine can reach Elastic (VPN, firewall, corporate proxy)\n" +
        "  • The API key has index and ingest_pipeline privileges\n",
    );
    if (err instanceof errors.ResponseError) {
      console.error(`HTTP ${err.meta.statusCode}: ${err.message}`);
    } else if (err instanceof Error) {
      console.error(err.message);
    }
    process.exit(1);
  }
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
  await testConnection(client);

  const allMappings = loadJson<Record<IndexName, { mappings: Record<string, unknown> }>>(
    "elastic-mappings.json",
  );

  const indexResults: Record<string, "created" | "already_existed"> = {};

  for (const index of INDICES) {
    const exists = await client.indices.exists({ index });
    if (exists) {
      indexResults[index] = "already_existed";
      continue;
    }
    const body = allMappings[index];
    if (!body?.mappings) {
      console.error(`No mappings defined in elastic-mappings.json for index "${index}".`);
      process.exit(1);
    }
    await client.indices.create({
      index,
      mappings: body.mappings as never,
    });
    indexResults[index] = "created";
  }

  const pipelineDef = loadJson<{
    description: string;
    processors: unknown[];
  }>("ingest-pipeline.json");

  let pipelineStatus: "created" | "updated";
  let pipelineExisted = false;
  try {
    await client.ingest.getPipeline({ id: "granola-notes-pipeline" });
    pipelineExisted = true;
  } catch (err) {
    if (err instanceof errors.ResponseError && err.meta.statusCode === 404) {
      pipelineExisted = false;
    } else {
      throw err;
    }
  }

  await client.ingest.putPipeline({
    id: "granola-notes-pipeline",
    description: pipelineDef.description,
    processors: pipelineDef.processors as never[],
  });
  pipelineStatus = pipelineExisted ? "updated" : "created";

  console.log("\n--- Elastic setup complete ---\n");
  console.log("Indices:");
  for (const index of INDICES) {
    const status = indexResults[index];
    console.log(
      `  • ${index}: ${status === "created" ? "created" : "already existed (skipped create)"}`,
    );
  }
  console.log("\nIngest pipeline:");
  console.log(
    `  • granola-notes-pipeline: ${pipelineStatus === "created" ? "created" : "updated (definition replaced)"}`,
  );
  console.log("\nNext: npm run seed:lookups (if you have not seeded lookups yet).\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
