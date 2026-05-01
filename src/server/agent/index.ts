import { Router } from "express";
import { getRequestScope } from "../auth/scope.js";
import { PERSONA_PROMPTS } from "./prompts.js";
import { TOOL_DEFINITIONS } from "./tool-definitions.js";
import { handleTool } from "./tool-handlers.js";
import { createMcpRouter } from "./mcp-server.js";

function stripActingUserFromBody(
  body: Record<string, unknown>,
): { params: Record<string, unknown> } {
  if (!body || typeof body !== "object") return { params: {} };
  // We still strip these fields from incoming bodies so an old client that
  // still sets them does not pollute the tool input. The acting user is
  // always derived from the verified session (req.user → scope.email).
  const { _acting_user, ...rest } = body;
  void _acting_user;
  return { params: rest as Record<string, unknown> };
}

/**
 * API routes and MCP JSON-RPC for agent tooling and Kibana / Agent Builder import.
 */
export function createAgentRouter(): Router {
  const router = Router();
  const mcp = createMcpRouter();

  router.use("/mcp", mcp);

  router.get("/agent/tools", (_req, res) => {
    res.json({ tools: TOOL_DEFINITIONS });
  });

  router.get("/agent/prompts", (_req, res) => {
    res.json({ prompts: PERSONA_PROMPTS });
  });

  router.post("/agent/tools/:toolName", async (req, res) => {
    const toolName = req.params.toolName;
    if (!toolName) {
      res.status(400).json({ error: "toolName required" });
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const { params } = stripActingUserFromBody(body);
    try {
      const scope = await getRequestScope(req);
      const result = await handleTool(toolName, params, scope, undefined);
      res.json({ ok: true, result });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(400).json({ ok: false, error: msg });
    }
  });

  return router;
}
