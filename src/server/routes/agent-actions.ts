import { Router } from "express";
import { getElastic } from "../elastic-instance.js";

const router = Router();

const SFDC_TOOLS = new Set(["sfdc_update_opportunity", "sfdc_log_call", "sfdc_create_task"]);

/**
 * GET /api/agent-actions?tool_name=sfdc_*&acting_user=&size=50&from=&to=
 */
router.get("/", async (req, res) => {
  try {
    const rawName = String(req.query.tool_name ?? "").trim();
    const actingUser = String(req.query.acting_user ?? "").trim() || undefined;
    const from = String(req.query.from ?? "").trim() || undefined;
    const to = String(req.query.to ?? "").trim() || undefined;
    const size = Number.parseInt(String(req.query.size ?? "50"), 10);

    let toolNamePrefix: string | undefined;
    let toolNameTerm: string | undefined;
    if (!rawName || rawName === "sfdc_*" || rawName === "all") {
      toolNamePrefix = "sfdc_";
    } else if (SFDC_TOOLS.has(rawName)) {
      toolNameTerm = rawName;
    } else if (rawName.startsWith("sfdc_") && !rawName.includes("*")) {
      toolNamePrefix = rawName;
    } else {
      toolNamePrefix = "sfdc_";
    }

    const actions = await getElastic().searchAgentActions({
      toolNamePrefix,
      toolNameTerm,
      actingUser,
      createdFrom: from,
      createdTo: to,
      size: Number.isFinite(size) ? size : 50,
    });
    res.json({ actions });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
    res.status(500).json({ error: "Failed to list agent actions" });
  }
});

export default router;
