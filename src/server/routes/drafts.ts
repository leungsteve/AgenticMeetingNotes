import { Router } from "express";
import { getRequestScope } from "../auth/scope.js";
import { getElastic } from "../elastic-instance.js";

const router = Router();

// GET /api/drafts — list drafts for the session user
router.get("/", async (req, res) => {
  try {
    const scope = await getRequestScope(req);
    const requestedOwner = String(req.query.owner ?? "").trim().toLowerCase();
    const owner = scope.isAdmin && requestedOwner ? requestedOwner : scope.email;
    if (!owner) return res.status(400).json({ error: "owner required" });

    const status = String(req.query.status ?? "").trim() || undefined;
    const size = Number.parseInt(String(req.query.size ?? "50"), 10);

    const drafts = await getElastic().listEmailDrafts(owner, {
      size: Number.isFinite(size) ? size : 50,
      status,
    });
    res.json({ drafts });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
    res.status(500).json({ error: "Failed to list drafts" });
  }
});

// PATCH /api/drafts/:id — update status (approve/dismiss) or edit subject/body
router.patch("/:id", async (req, res) => {
  try {
    const scope = await getRequestScope(req);
    const draftId = req.params.id;
    if (!draftId) return res.status(400).json({ error: "draft id required" });

    const owner = await getElastic().getEmailDraftOwner(draftId);
    if (owner == null) return res.status(404).json({ error: "Draft not found" });
    if (!scope.isAdmin && owner.trim().toLowerCase() !== scope.email) {
      return res.status(403).json({ error: "Not your draft" });
    }

    const b = req.body as {
      status?: string;
      subject?: string;
      body?: string;
    };

    const validStatuses = ["pending", "approved", "dismissed"] as const;
    type ValidStatus = (typeof validStatuses)[number];
    const patch: Partial<{ status: ValidStatus; subject: string; body: string }> = {};
    if (b.status != null) {
      if (!validStatuses.includes(b.status as ValidStatus)) {
        return res.status(400).json({ error: "status must be pending, approved, or dismissed" });
      }
      patch.status = b.status as ValidStatus;
    }
    if (typeof b.subject === "string") patch.subject = b.subject;
    if (typeof b.body === "string") patch.body = b.body;

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: "Nothing to update" });
    }

    await getElastic().patchEmailDraft(draftId, patch);
    res.json({ ok: true });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
    res.status(500).json({ error: "Failed to update draft" });
  }
});

export default router;
