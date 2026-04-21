import type { Request, Response } from "express";
import { slackUserToEmail } from "./user-mapping.js";

// Bolt-style HTTP slash command handler for /intelligence
// Phase 3 scaffold — no live posting
export async function handleSlashCommand(req: Request, res: Response): Promise<void> {
  const slackUserId = req.body?.user_id as string | undefined;
  const text = req.body?.text as string | undefined;

  // eslint-disable-next-line no-console
  console.log("[slack] Slash command received:", { slackUserId, text });

  // Resolve user
  const userEmail = slackUserId ? await slackUserToEmail(slackUserId) : null;
  // eslint-disable-next-line no-console
  console.log("[slack] Resolved user email:", userEmail);

  // In Phase 3, this will call handleTool / agent API and post back to Slack
  // For now, return immediate acknowledgement
  res.json({
    response_type: "ephemeral",
    text: "[Phase 3 scaffold] Account Intelligence Agent received your command. Live Slack integration coming soon.",
  });
}
