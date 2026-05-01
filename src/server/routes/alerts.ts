import { Router } from "express";
import { canSeeAccount, getRequestScope } from "../auth/scope.js";
import { getElastic } from "../elastic-instance.js";

const router = Router();

// GET /api/alerts?owner=email&unread_only=true
//
// Non-admins can only read their own alert queue; the `owner` query
// param is overwritten to the verified caller's email. Admins may pass
// any owner.
router.get("/", async (req, res) => {
  try {
    const scope = await getRequestScope(req);
    const requestedOwner = String(req.query.owner ?? "").trim().toLowerCase();
    const owner = scope.isAdmin && requestedOwner ? requestedOwner : scope.email;
    if (!owner) return res.status(400).json({ error: "owner required" });
    const unreadOnly = String(req.query.unread_only ?? "false") === "true";
    const size = Number.parseInt(String(req.query.size ?? "50"), 10);
    const alerts = await getElastic().listAlerts(owner, {
      unreadOnly,
      size: Number.isFinite(size) ? size : 50,
    });
    res.json({ alerts });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
    res.status(500).json({ error: "Failed to list alerts" });
  }
});

// POST /api/alerts — create an alert (must reference a visible account; can
// only target self unless admin).
router.post("/", async (req, res) => {
  try {
    const scope = await getRequestScope(req);
    const b = req.body as {
      alert_type?: string;
      account?: string;
      owner?: string;
      severity?: string;
      message?: string;
      dedup_key?: string;
      metadata?: Record<string, unknown>;
    };
    if (!b.alert_type || !b.account || !b.owner || !b.severity || !b.message || !b.dedup_key) {
      return res
        .status(400)
        .json({ error: "alert_type, account, owner, severity, message, and dedup_key are required" });
    }
    if (!canSeeAccount(scope, b.account)) {
      return res.status(403).json({ error: "Account not in your visibility scope" });
    }
    const targetOwner = b.owner.trim().toLowerCase();
    if (!scope.isAdmin && targetOwner !== scope.email) {
      return res.status(403).json({ error: "Only admins can create alerts targeted at another user" });
    }
    const r = await getElastic().createAlert({
      alert_type: b.alert_type,
      account: b.account,
      owner: b.owner,
      severity: b.severity,
      message: b.message,
      dedup_key: b.dedup_key,
      metadata: b.metadata,
    });
    res.json(r);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
    res.status(500).json({ error: "Failed to create alert" });
  }
});

// POST /api/alerts/:id/read — only the owner (or an admin) may mark an alert read.
router.post("/:id/read", async (req, res) => {
  try {
    const scope = await getRequestScope(req);
    const owner = await getElastic().getAlertOwner(req.params.id);
    if (owner == null) return res.status(404).json({ error: "Alert not found" });
    if (!scope.isAdmin && owner.trim().toLowerCase() !== scope.email) {
      return res.status(403).json({ error: "You can only mark your own alerts read" });
    }
    await getElastic().markAlertRead(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
    res.status(500).json({ error: "Failed to mark alert read" });
  }
});

export default router;
