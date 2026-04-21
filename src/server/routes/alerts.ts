import { Router } from "express";
import { getElastic } from "../elastic-instance.js";

const router = Router();

// GET /api/alerts?owner=email&unread_only=true
router.get("/", async (req, res) => {
  try {
    const owner = String(req.query.owner ?? "").trim();
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

// POST /api/alerts
router.post("/", async (req, res) => {
  try {
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

// POST /api/alerts/:id/read
router.post("/:id/read", async (req, res) => {
  try {
    await getElastic().markAlertRead(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
    res.status(500).json({ error: "Failed to mark alert read" });
  }
});

export default router;
