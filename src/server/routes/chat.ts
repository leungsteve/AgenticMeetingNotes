import { Router } from "express";

const router = Router();

router.post("/", async (req, res) => {
  const agentUrl = process.env.AGENT_BUILDER_URL;
  if (!agentUrl?.trim()) {
    return res
      .status(503)
      .json({ error: "AGENT_BUILDER_URL not configured. Set it in .env to enable chat." });
  }
  void req;
  // Phase 2: proxy SSE to Agent Builder
  // For now, return 501 Not Implemented
  res.status(501).json({ error: "Chat proxy not yet implemented. Coming in Phase 2." });
});

export default router;
