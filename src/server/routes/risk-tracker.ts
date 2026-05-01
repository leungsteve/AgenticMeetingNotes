import { Router } from "express";
import { getElastic } from "../elastic-instance.js";
import {
  buildRiskTrackerRow,
  computeOpportunityRollup,
} from "../workers/opportunity-rollup-worker.js";
import type {
  OpportunityDocument,
  OpportunityRollupDocument,
  OpportunityRollupSearchFilters,
} from "../services/elastic.js";

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

interface RiskTrackerRowJson {
  opp_id: string;
  account: string;
  opp_name: string;
  acv: number | null;
  close_quarter: string | null;
  forecast_category: string | null;
  sales_stage: string | null;
  owner_se_email: string | null;
  owner_ae_email: string | null;
  manager_email: string | null;
  director_email: string | null;
  vp_email: string | null;
  rvp_email: string | null;
  avp_email: string | null;
  tier: string | null;
  tech_status: string | null;
  tech_status_reason: string | null;
  path_to_tech_win: string | null;
  next_milestone_date: string | null;
  next_milestone_description: string | null;
  what_changed: string | null;
  help_needed: string | null;
  last_meeting_date: string | null;
  open_action_items: number | null;
  overdue_action_items: number | null;
  blockers: string[];
  competitors: string[];
  escalation_recommended: boolean;
  escalation_severity: string | null;
  computed_at: string | null;
  has_rollup: boolean;
}

function rowFromOppAndRollup(
  opp: OpportunityDocument,
  rollup: OpportunityRollupDocument | null,
): RiskTrackerRowJson {
  return {
    opp_id: opp.opp_id,
    account: opp.account,
    opp_name: opp.opp_name ?? "",
    acv: opp.acv ?? null,
    close_quarter: opp.close_quarter ?? null,
    forecast_category: opp.forecast_category ?? null,
    sales_stage: opp.sales_stage ?? null,
    owner_se_email: opp.owner_se_email ?? null,
    owner_ae_email: opp.owner_ae_email ?? null,
    manager_email: opp.manager_email ?? null,
    director_email: opp.director_email ?? null,
    vp_email: opp.vp_email ?? null,
    rvp_email: opp.rvp_email ?? null,
    avp_email: opp.avp_email ?? null,
    tier: opp.tier ?? null,
    tech_status: rollup?.tech_status ?? null,
    tech_status_reason: rollup?.tech_status_reason ?? null,
    path_to_tech_win: rollup?.path_to_tech_win ?? null,
    next_milestone_date: rollup?.next_milestone?.date ?? null,
    next_milestone_description: rollup?.next_milestone?.description ?? null,
    what_changed: rollup?.what_changed ?? null,
    help_needed: rollup?.help_needed ?? null,
    last_meeting_date: rollup?.last_meeting_date ?? null,
    open_action_items: rollup?.open_action_items ?? null,
    overdue_action_items: rollup?.overdue_action_items ?? null,
    blockers: rollup?.blockers ?? [],
    competitors: rollup?.competitors ?? [],
    escalation_recommended: Boolean(rollup?.escalation_recommended),
    escalation_severity: rollup?.escalation_severity ?? null,
    computed_at: rollup?.computed_at ?? null,
    has_rollup: rollup != null,
  };
}

async function buildRows(filters: OpportunityRollupSearchFilters): Promise<RiskTrackerRowJson[]> {
  const elastic = getElastic();
  const opps = await elastic.listOpportunities({
    owner_se_email: filters.owner_se_email,
    owner_ae_email: filters.owner_ae_email,
    manager_email: filters.manager_email,
    director_email: filters.director_email,
    vp_email: filters.vp_email,
    rvp_email: filters.rvp_email,
    avp_email: filters.avp_email,
    tier: filters.tier,
    forecast_category: filters.forecast_category,
    account: filters.account,
    size: filters.size ?? 2000,
  });
  const rollups = await elastic.searchOpportunityRollups({ size: 2000 });
  const byId = new Map<string, OpportunityRollupDocument>();
  for (const r of rollups) {
    if (r.opp_id) byId.set(r.opp_id, r);
  }
  const rows = opps.map((o) => rowFromOppAndRollup(o, byId.get(o.opp_id) ?? null));
  if (filters.tech_status) {
    const want = filters.tech_status.toLowerCase();
    return rows.filter((r) => (r.tech_status ?? "").toLowerCase() === want);
  }
  return rows;
}

const CSV_HEADERS: Array<{ key: keyof RiskTrackerRowJson; label: string }> = [
  { key: "account", label: "Account" },
  { key: "opp_name", label: "Opportunity" },
  { key: "acv", label: "ACV" },
  { key: "close_quarter", label: "Close Quarter" },
  { key: "forecast_category", label: "Forecast" },
  { key: "sales_stage", label: "Sales Stage" },
  { key: "owner_se_email", label: "SE" },
  { key: "owner_ae_email", label: "AE" },
  { key: "manager_email", label: "Manager" },
  { key: "tier", label: "Tier" },
  { key: "tech_status", label: "Tech Status (RYG)" },
  { key: "tech_status_reason", label: "Tech Status Reason" },
  { key: "path_to_tech_win", label: "Path to Tech Win" },
  { key: "next_milestone_date", label: "Next Milestone Date" },
  { key: "next_milestone_description", label: "Next Milestone" },
  { key: "what_changed", label: "What Changed" },
  { key: "help_needed", label: "Help Needed" },
  { key: "last_meeting_date", label: "Last Meeting" },
  { key: "open_action_items", label: "Open Action Items" },
  { key: "overdue_action_items", label: "Overdue Action Items" },
];

function csvEscape(value: unknown): string {
  if (value == null) return "";
  const s = Array.isArray(value) ? value.join("; ") : String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

router.get("/", async (req, res) => {
  try {
    const rows = await buildRows({
      owner_se_email: pickStr(req.query.owner_se_email),
      owner_ae_email: pickStr(req.query.owner_ae_email),
      manager_email: pickStr(req.query.manager_email),
      director_email: pickStr(req.query.director_email),
      vp_email: pickStr(req.query.vp_email),
      rvp_email: pickStr(req.query.rvp_email),
      avp_email: pickStr(req.query.avp_email),
      tier: pickStr(req.query.tier),
      forecast_category: pickStr(req.query.forecast_category),
      account: pickStr(req.query.account),
      tech_status: pickStr(req.query.tech_status),
      size: pickInt(req.query.size),
    });
    res.json({ rows, count: rows.length });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
    res.status(500).json({ error: "Failed to load risk tracker rows" });
  }
});

router.get("/export.csv", async (req, res) => {
  try {
    const rows = await buildRows({
      owner_se_email: pickStr(req.query.owner_se_email),
      owner_ae_email: pickStr(req.query.owner_ae_email),
      manager_email: pickStr(req.query.manager_email),
      director_email: pickStr(req.query.director_email),
      vp_email: pickStr(req.query.vp_email),
      rvp_email: pickStr(req.query.rvp_email),
      avp_email: pickStr(req.query.avp_email),
      tier: pickStr(req.query.tier),
      forecast_category: pickStr(req.query.forecast_category),
      account: pickStr(req.query.account),
      tech_status: pickStr(req.query.tech_status),
      size: 2000,
    });
    const header = CSV_HEADERS.map((h) => csvEscape(h.label)).join(",");
    const lines = rows.map((r) =>
      CSV_HEADERS.map((h) => csvEscape(r[h.key])).join(","),
    );
    const body = [header, ...lines].join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=\"risk-tracker-${new Date().toISOString().slice(0, 10)}.csv\"`,
    );
    res.send(body);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
    res.status(500).json({ error: "Failed to export risk tracker CSV" });
  }
});

router.get("/row/:opp_id", async (req, res) => {
  try {
    const opp = await getElastic().getOpportunity(req.params.opp_id);
    if (!opp) {
      res.status(404).json({ error: "Opportunity not found" });
      return;
    }
    const rollup = await getElastic().getOpportunityRollup(req.params.opp_id);
    const row = rowFromOppAndRollup(opp, rollup);
    res.json({ row, kevin_format: buildRiskTrackerRow(opp, rollup) });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
    res.status(500).json({ error: "Failed to load risk tracker row" });
  }
});

router.post("/:opp_id/regenerate", async (req, res) => {
  try {
    const opp = await getElastic().getOpportunity(req.params.opp_id);
    if (!opp) {
      res.status(404).json({ error: "Opportunity not found" });
      return;
    }
    const rollup = await computeOpportunityRollup(opp);
    res.json({ ok: true, rollup });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
    res.status(500).json({ error: "Failed to regenerate opportunity rollup" });
  }
});

export default router;
