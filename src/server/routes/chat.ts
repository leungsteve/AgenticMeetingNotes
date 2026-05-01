import { Router } from "express";
import { PERSONA_PROMPTS } from "../agent/prompts.js";

type AgentPersona = keyof typeof PERSONA_PROMPTS;

const router = Router();

const AGENT_ID = "account-intelligence-agent";

interface ConverseRequest {
  message?: unknown;
  persona?: unknown;
  conversation_id?: unknown;
}

interface KibanaConverseResponse {
  conversation_id?: string;
  status?: string;
  response?: { message?: string };
  message?: string;
  statusCode?: number;
}

router.post("/", async (req, res) => {
  const agentUrl = process.env.AGENT_BUILDER_URL?.trim();
  const apiKey = (process.env.AGENT_BUILDER_API_KEY ?? process.env.ELASTIC_API_KEY ?? "").trim();

  if (!agentUrl) {
    res.status(503).json({ error: "AGENT_BUILDER_URL not configured. Set it in .env to enable chat." });
    return;
  }

  const body = req.body as ConverseRequest;
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) {
    res.status(400).json({ error: "message is required" });
    return;
  }

  const persona = (typeof body.persona === "string" ? body.persona : "ae") as AgentPersona;
  const conversationId = typeof body.conversation_id === "string" ? body.conversation_id : undefined;
  const personaPrompt = PERSONA_PROMPTS[persona] ?? PERSONA_PROMPTS.ae;

  const payload: Record<string, unknown> = {
    input: message,
    agent_id: AGENT_ID,
    configuration_overrides: { instructions: personaPrompt },
  };
  if (conversationId) {
    payload.conversation_id = conversationId;
  }

  try {
    const upstream = await fetch(`${agentUrl}/api/agent_builder/converse`, {
      method: "POST",
      headers: {
        "Authorization": `ApiKey ${apiKey}`,
        "kbn-xsrf": "true",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = (await upstream.json()) as KibanaConverseResponse;

    if (!upstream.ok) {
      const errMsg = data.message ?? `Kibana returned ${upstream.status}`;
      res.status(upstream.status).json({ error: errMsg });
      return;
    }

    res.json({
      message: data.response?.message ?? "",
      conversation_id: data.conversation_id,
      status: data.status,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Chat request failed";
    res.status(502).json({ error: msg });
  }
});

export default router;
