import { Router } from "express";
import {
  accountVisibilityFilter,
  canSeeAccount,
  getRequestScope,
} from "../auth/scope.js";
import { getElastic } from "../elastic-instance.js";

const router = Router();

// GET /api/action-items?account=&owner=&status=&overdue=true
router.get("/", async (req, res) => {
  try {
    const scope = await getRequestScope(req);
    const account = String(req.query.account ?? "").trim() || undefined;
    if (account && !canSeeAccount(scope, account)) {
      return res.json({ action_items: [] });
    }
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
      scopeFilter: account ? null : accountVisibilityFilter(scope),
    });
    res.json({ action_items: items });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
    res.status(500).json({ error: "Failed to list action items" });
  }
});

export default router;
