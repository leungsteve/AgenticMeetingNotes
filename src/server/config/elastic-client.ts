import { Client } from "@elastic/elasticsearch";

/**
 * Supports Elastic Cloud ID (`name:base64...`) or a full cluster URL in
 * `ELASTIC_CLOUD_ID` (common when copying the endpoint from Cloud UI).
 */
export function createElasticsearchClientFromEnv(): Client {
  const cloudIdOrUrl = process.env.ELASTIC_CLOUD_ID?.trim();
  const apiKey = process.env.ELASTIC_API_KEY?.trim();
  if (!cloudIdOrUrl || !apiKey) {
    throw new Error(
      "Missing ELASTIC_CLOUD_ID or ELASTIC_API_KEY. See PROJECT_BRIEF.md (Elastic Serverless Setup Guide).",
    );
  }
  if (/^https?:\/\//i.test(cloudIdOrUrl)) {
    return new Client({ node: cloudIdOrUrl, auth: { apiKey } });
  }
  return new Client({
    cloud: { id: cloudIdOrUrl },
    auth: { apiKey },
  });
}
