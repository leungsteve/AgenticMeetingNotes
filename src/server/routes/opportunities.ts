/**
 * Opportunities API
 *
 * Read/write surface for the `opportunities` index. The index is the
 * single source of truth for opportunity-spine data (account, ACV, close
 * quarter, forecast category, owner SE/AE, manager, tier) used by the Risk
 * Tracker, Manager Dashboard, agent tools, opportunity-rollup-worker, and
 * Friday digest worker.
 *
 * IMPORTANT — fictitious data only:
 *   This file does not hardcode any account names. The seed data for
 *   `data/opportunities.csv` is fictitious by design (Aurora Health Systems,
 *   Helix Robotics, Lattice Insurance, Polaris Energy, Meridian Systems,
 *   Stratum Networks, Redwood Logistics, Nimbus Cloud). Never commit real
 *   customer names. To customize the demo, edit `data/opportunities.csv` and
 *   the matching arrays in `scripts/seed-lookups.ts`, then re-run
 *   `npm run seed:lookups && npm run seed:opportunities`.
 *
 *   When live Salesforce / Clari API access is granted, the source-of-truth
 *   shifts to the API poller (see `docs/data-sources.md`); the contract here
 *   does not change.
 */
import { Router } from "express";
import { getElastic } from "../elastic-instance.js";
import type { OpportunityDocument } from "../services/elastic.js";

const router = Router();

function pickStr(v: unknown): string | undefined {
  if (typeof v !== "string" || !v.trim()) return undefined;
  return v.trim();
}

function pickInt(v: unknown): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

router.get("/", async (req, res) => {
  try {
    const opportunities = await getElastic().listOpportunities({
      owner_se_email: pickStr(req.query.owner_se_email),
      manager_email: pickStr(req.query.manager_email),
      tier: pickStr(req.query.tier),
      forecast_category: pickStr(req.query.forecast_category),
      account: pickStr(req.query.account),
      size: pickInt(req.query.size),
    });
    res.json({ opportunities, count: opportunities.length });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
    res.status(500).json({ error: "Failed to list opportunities" });
  }
});

router.get("/:opp_id", async (req, res) => {
  try {
    const opp = await getElastic().getOpportunity(req.params.opp_id);
    if (!opp) {
      res.status(404).json({ error: "Opportunity not found" });
      return;
    }
    res.json(opp);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
    res.status(500).json({ error: "Failed to load opportunity" });
  }
});

router.post("/", async (req, res) => {
  try {
    const body = (req.body ?? {}) as Partial<OpportunityDocument>;
    if (!body.opp_id || !body.account) {
      res.status(400).json({ error: "opp_id and account are required" });
      return;
    }
    await getElastic().upsertOpportunity({
      ...(body as OpportunityDocument),
      source: body.source ?? "api",
    });
    res.json({ ok: true });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
    res.status(500).json({ error: "Failed to upsert opportunity" });
  }
});

export default router;
