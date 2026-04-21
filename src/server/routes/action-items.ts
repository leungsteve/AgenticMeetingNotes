import { Router } from "express";
import { getElastic } from "../elastic-instance.js";

const router = Router();

// GET /api/action-items?account=&owner=&status=&overdue=true
router.get("/", async (req, res) => {
  try {
    const account = String(req.query.account ?? "").trim() || undefined;
    const owner = String(req.query.owner ?? "").trim() || undefined;
    const status = String(req.query.status ?? "").trim() || undefined;
    const overdue = String(req.query.overdue ?? "false") === "true";
    const size = Number.parseInt(String(req.query.size ?? "100"), 10);
    const items = await getElastic().listActionItems({
      account,
      owner,
      status,
      overdue: overdue || undefined,
      size: Number.isFinite(size) ? size : 100,
    });
    res.json({ action_items: items });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
    res.status(500).json({ error: "Failed to list action items" });
  }
});

export default router;
