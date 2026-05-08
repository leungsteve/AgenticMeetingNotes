import { Router } from "express";
import { getRequestScope } from "../auth/scope.js";

const router = Router();

interface ConverseRequest {
  message?: string;
  persona?: string;
  conversation_id?: string;
  agent_id?: string;
}

interface ConverseResponse {
  response: string;
  conversation_id: string;
  steps?: unknown[];
}

router.post("/", async (req, res) => {
  const baseUrl = process.env.AGENT_BUILDER_URL?.replace(/\/+$/, "");
  const apiKey = process.env.AGENT_BUILDER_API_KEY ?? process.env.ELASTIC_API_KEY;

  if (!baseUrl?.trim()) {
    res.status(503).json({ error: "AGENT_BUILDER_URL not configured." });
    return;
  }
  if (!apiKey?.trim()) {
    res.status(503).json({ error: "AGENT_BUILDER_API_KEY not configured." });
    return;
  }

  const scope = await getRequestScope(req);
  const body = req.body as ConverseRequest;
  const message = String(body.message ?? "").trim();
  if (!message) {
    res.status(400).json({ error: "message is required" });
    return;
  }

  const agentId = body.agent_id ?? process.env.AGENT_BUILDER_CHAT_AGENT_ID ?? "account-intelligence-agent";
  const conversationId = body.conversation_id?.trim() || undefined;

  // Inject caller identity on the first turn of every conversation.
  // Agent Builder has no separate system-context field on /converse, so we
  // prepend it to the input. On subsequent turns (conversation_id already set)
  // the agent retains the context from the first turn.
  const input = conversationId
    ? message
    : `[Caller: ${scope.email}. Always scope responses to this user's data unless they explicitly ask to see someone else's. When asked about MEDDPICC (or the legacy spelling MEDPICC), use the opportunity rollup data to report coverage per dimension (Metrics, Economic Buyer, Decision Criteria, Decision Process, Paper Process, Identify Pain, Champion, Competition — 8 dimensions, scored /8) and highlight which dimensions are missing. Decision Process is captured on the note's decision_process field and rolls up under medpicc.decision_process.]\n\n${message}`;

  const payload: Record<string, unknown> = {
    input,
    agent_id: agentId,
  };
  if (conversationId) payload.conversation_id = conversationId;

  try {
    const upstream = await fetch(`${baseUrl}/api/agent_builder/converse`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `ApiKey ${apiKey}`,
        "kbn-xsrf": "true",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60_000),
    });

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => "");
      // eslint-disable-next-line no-console
      console.error(`[chat] Agent Builder ${upstream.status}:`, text.slice(0, 200));
      res.status(502).json({ error: `Agent Builder returned ${upstream.status}` });
      return;
    }

    const json = (await upstream.json()) as {
      response?: { message?: string };
      conversation_id?: string;
      steps?: unknown[];
      status?: string;
    };

    const out: ConverseResponse = {
      response: json.response?.message ?? "",
      conversation_id: json.conversation_id ?? "",
      steps: json.steps,
    };

    // eslint-disable-next-line no-console
    console.log(`[chat] user=${scope.email} agent=${agentId} conv=${out.conversation_id} chars=${out.response.length}`);

    res.json(out);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    // eslint-disable-next-line no-console
    console.error("[chat] upstream error:", msg);
    res.status(502).json({ error: `Agent Builder unreachable: ${msg}` });
  }
});

export default router;
