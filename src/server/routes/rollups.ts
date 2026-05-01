import { Router } from "express";
import {
  accountVisibilityFilter,
  canSeeAccount,
  getRequestScope,
} from "../auth/scope.js";
import { getElastic } from "../elastic-instance.js";

const router = Router();

// GET /api/rollups — list all
router.get("/", async (req, res) => {
  try {
    const scope = await getRequestScope(req);
    const rollups = await getElastic().listAccountRollups({
      scopeFilter: accountVisibilityFilter(scope),
    });
    res.json({ rollups });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
    res.status(500).json({ error: "Failed to list rollups" });
  }
});

// GET /api/rollups/:account — get one
router.get("/:account", async (req, res) => {
  try {
    const scope = await getRequestScope(req);
    if (!canSeeAccount(scope, req.params.account)) {
      return res.status(404).json({ error: "Not found" });
    }
    const rollup = await getElastic().getAccountRollup(req.params.account);
    if (!rollup) return res.status(404).json({ error: "Not found" });
    res.json(rollup);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
    res.status(500).json({ error: "Failed to load rollup" });
  }
});

export default router;
