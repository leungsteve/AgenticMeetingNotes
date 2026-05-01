import { Router } from "express";
import {
  accountVisibilityFilter,
  canSeeAccount,
  getRequestScope,
} from "../auth/scope.js";
import { multiUserEnabled } from "../auth/middleware.js";
import { elasticService } from "../elastic-instance.js";

const router = Router();

// GET /api/accounts — list all pursuit teams
router.get("/", async (req, res) => {
  try {
    const scope = await getRequestScope(req);
    const teams = await elasticService.listPursuitTeams({
      scopeFilter: accountVisibilityFilter(scope),
    });
    res.json({ accounts: teams });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
    res.status(500).json({ error: "Failed to list accounts" });
  }
});

// GET /api/accounts/:account — get one
router.get("/:account", async (req, res) => {
  try {
    const scope = await getRequestScope(req);
    if (!canSeeAccount(scope, req.params.account)) {
      return res.status(404).json({ error: "Not found" });
    }
    const team = await elasticService.getPursuitTeam(req.params.account);
    if (!team) return res.status(404).json({ error: "Not found" });
    res.json(team);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
    res.status(500).json({ error: "Failed to load account" });
  }
});

/**
 * Pursuit-team membership controls who can see what — mutating it is an
 * administrative action. In multi-user mode, only admins may change a
 * pursuit team. (In single-user dev mode the synthesized dev user has
 * isAdmin=true so existing flows continue to work.)
 */
function ensureCanEditPursuitTeam(req: Parameters<Parameters<Router["get"]>[1]>[0]): {
  ok: true;
  email: string;
} | { ok: false; status: number; error: string } {
  const user = req.user;
  if (!user) return { ok: false, status: 401, error: "Not authenticated" };
  if (multiUserEnabled() && !user.isAdmin) {
    return {
      ok: false,
      status: 403,
      error: "Only admins can edit pursuit-team membership. Ask your admin to update it.",
    };
  }
  return { ok: true, email: user.email };
}

// POST /api/accounts — create or update (admin only in MULTI_USER mode)
router.post("/", async (req, res) => {
  try {
    const guard = ensureCanEditPursuitTeam(req);
    if (!guard.ok) return res.status(guard.status).json({ error: guard.error });
    const { account, account_display, members, notes } = req.body as {
      account?: string;
      account_display?: string;
      members?: unknown;
      notes?: string;
    };
    if (!account) return res.status(400).json({ error: "account required" });
    await elasticService.upsertPursuitTeam(account, {
      account,
      account_display: account_display ?? account,
      members: members ?? [],
      notes: notes ?? "",
      updated_at: new Date().toISOString(),
      updated_by: guard.email,
    });
    res.json({ ok: true });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
    res.status(500).json({ error: "Failed to save account" });
  }
});

// PUT /api/accounts/:account — full replace (admin only in MULTI_USER mode)
router.put("/:account", async (req, res) => {
  try {
    const guard = ensureCanEditPursuitTeam(req);
    if (!guard.ok) return res.status(guard.status).json({ error: guard.error });
    const { account_display, members, notes } = req.body as {
      account_display?: string;
      members?: unknown;
      notes?: string;
    };
    await elasticService.upsertPursuitTeam(req.params.account, {
      account: req.params.account,
      account_display: account_display ?? req.params.account,
      members: members ?? [],
      notes: notes ?? "",
      updated_at: new Date().toISOString(),
      updated_by: guard.email,
    });
    res.json({ ok: true });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
    res.status(500).json({ error: "Failed to update account" });
  }
});

// DELETE /api/accounts/:account — not truly deleting, just clearing members
router.delete("/:account", (_req, res) => {
  res.status(405).json({ error: "Use PUT to clear members instead" });
});

export default router;
