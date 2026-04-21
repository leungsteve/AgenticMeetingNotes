import { Router, type Request } from "express";
import { TOOL_DEFINITIONS } from "./tool-definitions.js";
import { handleTool } from "./tool-handlers.js";

export const COMPOSITE_TOOLS = [
  "compare_two_accounts",
  "build_call_prep_brief",
  "flag_at_risk_accounts",
  "summarize_recent_changes",
] as const;

export const SFDC_TOOLS = ["sfdc_update_opportunity", "sfdc_log_call", "sfdc_create_task"] as const;

export const ALERT_TOOLS = ["create_alert", "list_my_alerts"] as const;

const MCP_TOOL_NAMES = new Set<string>([
  ...COMPOSITE_TOOLS,
  ...SFDC_TOOLS,
  ...ALERT_TOOLS,
]);

function mcpToolList() {
  return TOOL_DEFINITIONS.filter((t) => MCP_TOOL_NAMES.has(t.name));
}

function getActingUser(req: Request, bodyArgs: Record<string, unknown> | undefined): string {
  const h = req.header("X-Acting-User");
  if (h?.trim()) return h.trim();
  const fromArgs = bodyArgs?._acting_user;
  if (typeof fromArgs === "string" && fromArgs.trim()) return fromArgs.trim();
  return "anonymous";
}

function jsonRpcError(id: string | number | null, code: number, message: string) {
  return { jsonrpc: "2.0" as const, id, error: { code, message } };
}

function jsonRpcResult(
  id: string | number | null,
  result: unknown,
) {
  return {
    jsonrpc: "2.0" as const,
    id,
    result: {
      content: [{ type: "text" as const, text: JSON.stringify(result) }],
    },
  };
}

/**
 * JSON-RPC 2.0 over HTTP for Kibana / Agent Builder.
 * - GET (base path) — server capabilities and MCP tool subset
 * - POST — tools/call and future methods
 */
export function createMcpRouter(): Router {
  const router = Router();

  router.get("/", (_req, res) => {
    res.json({
      protocol: "mcp",
      version: "0.1",
      tools: mcpToolList(),
    });
  });

  router.post("/", async (req, res) => {
    const body = req.body as {
      jsonrpc?: string;
      id?: string | number | null;
      method?: string;
      params?: { name?: string; arguments?: Record<string, unknown> };
    };
    const id = body.id === undefined ? null : body.id;
    if (body.jsonrpc !== "2.0") {
      res.status(400).json(jsonRpcError(id, -32600, "Invalid Request: jsonrpc must be 2.0"));
      return;
    }
    if (body.method === "tools/call") {
      const name = body.params?.name;
      if (typeof name !== "string" || !name.trim()) {
        res.status(400).json(jsonRpcError(id, -32602, "Invalid params: missing tool name"));
        return;
      }
      const arg = body.params?.arguments ?? {};
      const actingUser = getActingUser(req, arg);
      const { _acting_user: _a, ...cleanArgs } = arg;
      void _a;
      const sid = req.header("X-Session-Id");
      const sessionId = sid?.trim() ? sid.trim() : undefined;
      try {
        const result = await handleTool(name, cleanArgs, actingUser, sessionId);
        res.json(jsonRpcResult(id, result));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        res.json(jsonRpcError(id, -32000, msg || "Tool execution failed"));
      }
      return;
    }
    res.status(400).json(jsonRpcError(id, -32601, `Method not found: ${String(body.method)}`));
  });

  return router;
}
