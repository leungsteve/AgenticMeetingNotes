import type { Client } from "@elastic/elasticsearch";
import { SLACK_USERS_INDEX } from "../../constants/elastic.js";
import { elasticService } from "../../elastic-instance.js";

export async function slackUserToEmail(slackUserId: string): Promise<string | null> {
  // Query integrations-slack-users index for this Slack user ID
  try {
    const client = (elasticService as unknown as { client: Client }).client;
    const res = await client.search({
      index: SLACK_USERS_INDEX,
      size: 1,
      query: { term: { slack_user_id: slackUserId } },
    });
    const src = res.hits.hits[0]?._source as { email?: string } | undefined;
    return src?.email ?? null;
  } catch {
    return null;
  }
}
