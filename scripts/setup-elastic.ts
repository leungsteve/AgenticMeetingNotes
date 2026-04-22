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
  "account-pursuit-team",
  "account-rollups",
  "action-items",
  "agent-actions",
  "agent-alerts",
  "agent-feedback",
  "integrations-slack-users",
] as const;

type IndexName = (typeof INDICES)[number];

async function verifyInferenceEndpoints(client: Client): Promise<{
  embeddings: "ok" | "missing";
  reranker: "ok" | "missing";
}> {
  const check = async (taskType: "text_embedding" | "rerank", id: string) => {
    try {
      await client.inference.get({ task_type: taskType, inference_id: id });
      return "ok" as const;
    } catch {
      return "missing" as const;
    }
  };
  return {
    embeddings: await check("text_embedding", ".jina-embeddings-v3"),
    reranker: await check("rerank", ".jina-reranker-v2-base-multilingual"),
  };
}

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

  const allMappings = loadJson<Record<string, { mappings: Record<string, unknown> }>>(
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

  const inferenceStatus = await verifyInferenceEndpoints(client);

  const rows: { resource: string; kind: string; status: string }[] = [];
  for (const index of INDICES) {
    const status = indexResults[index];
    rows.push({
      resource: index,
      kind: "index",
      status: status === "created" ? "created" : "already existed",
    });
  }
  rows.push({
    resource: "granola-notes-pipeline",
    kind: "ingest pipeline",
    status: pipelineStatus === "created" ? "created" : "updated",
  });
  rows.push({
    resource: ".jina-embeddings-v3",
    kind: "EIS / text_embedding",
    status: inferenceStatus.embeddings === "ok" ? "ready (Elastic-managed)" : "NOT FOUND",
  });
  rows.push({
    resource: ".jina-reranker-v2-base-multilingual",
    kind: "EIS / rerank",
    status: inferenceStatus.reranker === "ok" ? "ready (Elastic-managed)" : "NOT FOUND",
  });

  console.log("\n--- Elastic setup complete ---\n");
  console.table(rows);
  console.log("\nNext: npm run seed:lookups (if you have not seeded lookups yet).\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
