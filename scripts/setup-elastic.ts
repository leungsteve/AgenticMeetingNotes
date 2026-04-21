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

type InferenceRegStatus = "created" | "already_existed" | "skipped";

async function registerInferenceEndpoints(client: Client): Promise<{
  embeddings: InferenceRegStatus;
  reranker: InferenceRegStatus;
}> {
  const out: { embeddings: InferenceRegStatus; reranker: InferenceRegStatus } = {
    embeddings: "skipped",
    reranker: "skipped",
  };
  const apiKey = process.env.JINA_API_KEY?.trim();

  const handleEndpoint = async (
    kind: "text_embedding" | "rerank",
    inferenceId: string,
    modelId: string,
  ): Promise<InferenceRegStatus> => {
    try {
      try {
        await client.inference.get({ task_type: kind, inference_id: inferenceId });
        return "already_existed";
      } catch (e) {
        if (e instanceof errors.ResponseError && e.meta.statusCode === 404) {
          if (!apiKey) {
            console.warn(
              `JINA_API_KEY not set; skipping ${inferenceId} EIS registration (${kind}).`,
            );
            return "skipped";
          }
          try {
            await client.inference.putJinaai({
              task_type: kind,
              jinaai_inference_id: inferenceId,
              service: "jinaai",
              service_settings: {
                api_key: apiKey,
                model_id: modelId,
              },
            });
            return "created";
          } catch (putErr) {
            console.warn(`Failed to create inference endpoint ${inferenceId}:`, putErr);
            return "skipped";
          }
        }
        console.warn(`Could not verify inference endpoint ${inferenceId} (${kind}):`, e);
        return "skipped";
      }
    } catch (err) {
      console.warn(`registerInferenceEndpoints inner failure for ${inferenceId}:`, err);
      return "skipped";
    }
  };

  try {
    out.embeddings = await handleEndpoint("text_embedding", "jina-embeddings-v3", "jina-embeddings-v3");
    out.reranker = await handleEndpoint("rerank", "jina-reranker-v2", "jina-reranker-v2-base-en");
  } catch (e) {
    console.warn("registerInferenceEndpoints: non-fatal error:", e);
  }
  return out;
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

  const inferenceStatus = await registerInferenceEndpoints(client);

  const inferenceLabel = (s: InferenceRegStatus): string => {
    switch (s) {
      case "created":
        return "created";
      case "already_existed":
        return "already existed";
      default:
        return "skipped";
    }
  };

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
    resource: "jina-embeddings-v3",
    kind: "EIS / text_embedding",
    status: inferenceLabel(inferenceStatus.embeddings),
  });
  rows.push({
    resource: "jina-reranker-v2",
    kind: "EIS / rerank",
    status: inferenceLabel(inferenceStatus.reranker),
  });

  console.log("\n--- Elastic setup complete ---\n");
  console.table(rows);
  console.log("\nNext: npm run seed:lookups (if you have not seeded lookups yet).\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
