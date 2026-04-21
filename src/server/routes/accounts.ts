import { Router } from "express";
import { elasticService } from "../elastic-instance.js";

const router = Router();

function actingUser(req: { headers: { [k: string]: string | string[] | undefined } }): string {
  const raw = req.headers["x-acting-user"];
  if (Array.isArray(raw)) return String(raw[0] ?? "unknown");
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return "unknown";
}

// GET /api/accounts — list all pursuit teams
router.get("/", async (_req, res) => {
  try {
    const teams = await elasticService.listPursuitTeams();
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
    const team = await elasticService.getPursuitTeam(req.params.account);
    if (!team) return res.status(404).json({ error: "Not found" });
    res.json(team);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
    res.status(500).json({ error: "Failed to load account" });
  }
});

// POST /api/accounts — create or update
router.post("/", async (req, res) => {
  try {
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
      updated_by: actingUser(req),
    });
    res.json({ ok: true });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
    res.status(500).json({ error: "Failed to save account" });
  }
});

// PUT /api/accounts/:account — full replace
router.put("/:account", async (req, res) => {
  try {
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
      updated_by: actingUser(req),
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
