import { Router } from "express";
import { getElastic } from "../elastic-instance.js";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const elastic = getElastic();
    const tags = req.query.tags;
    const result = await elastic.searchIngestedNotes({
      account: pickStr(req.query.account),
      opportunity: pickStr(req.query.opportunity),
      author: pickStr(req.query.author),
      meeting_type: pickStr(req.query.meeting_type),
      sales_stage: pickStr(req.query.sales_stage),
      tags: tags === undefined ? undefined : Array.isArray(tags) ? tags.map(String) : String(tags),
      from: pickStr(req.query.from),
      to: pickStr(req.query.to),
      q: pickStr(req.query.q),
      page: pickNum(req.query.page, 1),
      size: pickNum(req.query.size, 20),
    });
    res.json(result);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
    res.status(500).json({ error: "Failed to search ingested notes" });
  }
});

router.get("/:noteId", async (req, res) => {
  try {
    const elastic = getElastic();
    const doc = await elastic.getIngestedNote(req.params.noteId);
    if (!doc) {
      res.status(404).json({ error: "Note not found" });
      return;
    }
    res.json(doc);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
    res.status(500).json({ error: "Failed to load ingested note" });
  }
});

function pickStr(v: unknown): string | undefined {
  if (typeof v !== "string" || !v.trim()) return undefined;
  return v.trim();
}

function pickNum(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export default router;
