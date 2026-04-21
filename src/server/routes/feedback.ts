import { Router } from "express";
import { getElastic } from "../elastic-instance.js";

const router = Router();

// POST /api/feedback
router.post("/", async (req, res) => {
  try {
    const b = req.body as {
      session_id?: string;
      message_id?: string;
      rating?: number;
      comment?: string;
      acting_user?: string;
      tool_calls?: unknown;
    };
    if (b.session_id == null || b.message_id == null || b.rating == null || !b.acting_user) {
      return res.status(400).json({ error: "session_id, message_id, rating, and acting_user are required" });
    }
    await getElastic().saveFeedback({
      session_id: b.session_id,
      message_id: b.message_id,
      rating: b.rating,
      comment: b.comment,
      tool_calls: b.tool_calls,
      acting_user: b.acting_user,
    });
    res.json({ ok: true });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
    res.status(500).json({ error: "Failed to save feedback" });
  }
});

export default router;
