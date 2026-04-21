import { Router } from "express";
import { getElastic } from "../elastic-instance.js";
import type { LookupDocument } from "../services/elastic.js";

const router = Router();

router.get("/", async (req, res) => {
  const type = pickStr(req.query.type);
  if (!type) {
    res.status(400).json({ error: "type query parameter is required (account, opportunity, meeting_type, tag, sales_stage)" });
    return;
  }
  try {
    const elastic = getElastic();
    const rows = await elastic.getLookupsByType(type);
    res.json(rows);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
    res.status(500).json({ error: "Failed to load lookups" });
  }
});

router.post("/", async (req, res) => {
  const body = req.body as Partial<LookupDocument>;
  const type = String(body.type ?? "").trim();
  const value = String(body.value ?? "").trim();
  const label = String(body.label ?? value).trim();
  if (!type || !value) {
    res.status(400).json({ error: "type and value are required" });
    return;
  }
  try {
    const elastic = getElastic();
    const doc: LookupDocument = { type, value, label };
    await elastic.addLookup(doc);
    res.json(doc);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
    res.status(500).json({ error: "Failed to add lookup" });
  }
});

function pickStr(v: unknown): string | undefined {
  if (typeof v !== "string" || !v.trim()) return undefined;
  return v.trim();
}

export default router;
