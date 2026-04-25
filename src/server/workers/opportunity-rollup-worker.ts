import { elasticService } from "../elastic-instance.js";
import type {
  OpportunityDocument,
  OpportunityRollupDocument,
} from "../services/elastic.js";

const RED = "red";
const YELLOW = "yellow";
const GREEN = "green";

const COMMIT_THRESHOLD_ACV = 1_000_000;

function pickStr(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length ? s : null;
}

function lcStatus(v: unknown): "red" | "yellow" | "green" | null {
  const s = pickStr(v)?.toLowerCase();
  if (s === RED || s === YELLOW || s === GREEN) return s;
  return null;
}

function compareDescByDate(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): number {
  const ad = String(a.meeting_date ?? a.updated_at ?? "");
  const bd = String(b.meeting_date ?? b.updated_at ?? "");
  return bd.localeCompare(ad);
}

function pickFromMostRecent<T>(
  notes: Array<Record<string, unknown>>,
  fn: (n: Record<string, unknown>) => T | null,
): { value: T | null; sourceNoteId: string | null; sourceMeetingDate: string | null } {
  for (const n of notes) {
    const v = fn(n);
    if (v != null) {
      return {
        value: v,
        sourceNoteId: pickStr(n.note_id) ?? pickStr((n as { _id?: unknown })._id),
        sourceMeetingDate: pickStr(n.meeting_date),
      };
    }
  }
  return { value: null, sourceNoteId: null, sourceMeetingDate: null };
}

function computeMomentum(
  notes: Array<Record<string, unknown>>,
  techStatus: "red" | "yellow" | "green" | null,
  overdueCount: number,
): number {
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
  let m = 0;
  for (const n of notes) {
    const d = pickStr(n.meeting_date);
    const t = d ? Date.parse(d) : NaN;
    if (Number.isFinite(t) && t >= thirtyDaysAgo) m += 1;
    const sentiment = pickStr(
      (n.customer_sentiment as Record<string, unknown> | undefined)?.overall,
    );
    if (sentiment === "enthusiastic") m += 2;
    else if (sentiment === "positive") m += 1;
    else if (sentiment === "concerned" || sentiment === "skeptical") m -= 1;
  }
  if (techStatus === GREEN) m += 1;
  if (techStatus === RED) m -= 2;
  m -= overdueCount * 0.5;
  return Math.round(m * 10) / 10;
}

export interface ComputeOpportunityRollupOptions {
  notesLimit?: number;
}

/** Builds (does not persist) a rollup document for the opportunity. */
export async function buildOpportunityRollup(
  opp: OpportunityDocument,
  opts: ComputeOpportunityRollupOptions = {},
): Promise<OpportunityRollupDocument> {
  const limit = opts.notesLimit ?? 25;
  const notes = await elasticService.getNotesForOpportunity(opp.opp_id, limit);
  notes.sort(compareDescByDate);

  const techPick = pickFromMostRecent(notes, (n) => lcStatus(n.tech_status));
  const techStatus = techPick.value;

  const techReasonPick = pickFromMostRecent(notes, (n) => pickStr(n.tech_status_reason));
  const pathPick = pickFromMostRecent(notes, (n) => pickStr(n.path_to_tech_win));
  const helpPick = pickFromMostRecent(notes, (n) => pickStr(n.help_needed));
  const whatChangedPick = pickFromMostRecent(notes, (n) => pickStr(n.what_changed));
  const milestonePick = pickFromMostRecent(notes, (n) => {
    const m = n.next_milestone as Record<string, unknown> | undefined;
    if (!m) return null;
    const date = pickStr(m.date);
    const description = pickStr(m.description);
    if (!date && !description) return null;
    return { date, description };
  });

  const lastMeetingDate = notes.length ? pickStr(notes[0].meeting_date) : null;
  const lastUpdateAt = notes.length
    ? pickStr(notes[0].updated_at) ?? pickStr(notes[0].ingested_at)
    : null;

  const last5NoteIds = notes
    .slice(0, 5)
    .map((n) => pickStr(n.note_id) ?? pickStr((n as { _id?: unknown })._id))
    .filter((s): s is string => Boolean(s));

  const blockers = new Set<string>();
  const competitors = new Set<string>();
  for (const n of notes) {
    const cl = n.competitive_landscape as Record<string, unknown> | undefined;
    if (Array.isArray(cl?.competitors_evaluating)) {
      for (const c of cl.competitors_evaluating) {
        if (typeof c === "string" && c.trim()) competitors.add(c.trim());
      }
    }
    const cs = n.customer_sentiment as Record<string, unknown> | undefined;
    const concerns = pickStr(cs?.concerns);
    if (concerns) blockers.add(concerns);
    const objections = pickStr(cs?.objections);
    if (objections) blockers.add(objections);
  }

  let openItems = 0;
  let overdueItems = 0;
  if (opp.account) {
    const items = await elasticService.listActionItems({
      account: opp.account,
      status: "open",
      size: 500,
    });
    openItems = items.length;
    const now = Date.now();
    overdueItems = items.filter((it) => {
      const dd = pickStr((it as { due_date?: unknown }).due_date);
      const t = dd ? Date.parse(dd) : NaN;
      return Number.isFinite(t) && t < now;
    }).length;
  }

  const forecast = pickStr(opp.forecast_category)?.toLowerCase() ?? null;
  const acv = typeof opp.acv === "number" ? opp.acv : 0;
  const escalationRecommended =
    techStatus === RED && (forecast === "commit" || acv >= COMMIT_THRESHOLD_ACV);
  const severity: "high" | "medium" | "low" | null = escalationRecommended
    ? "high"
    : techStatus === RED
      ? "medium"
      : techStatus === YELLOW
        ? "low"
        : null;

  const momentum = computeMomentum(notes, techStatus, overdueItems);

  const rollup: OpportunityRollupDocument = {
    opp_id: opp.opp_id,
    account: opp.account,
    opp_name: opp.opp_name,
    acv: opp.acv,
    close_quarter: opp.close_quarter,
    forecast_category: opp.forecast_category,
    sales_stage: opp.sales_stage,
    owner_se_email: opp.owner_se_email,
    owner_ae_email: opp.owner_ae_email,
    manager_email: opp.manager_email,
    tier: opp.tier,
    tech_status: techStatus,
    tech_status_reason: techReasonPick.value,
    tech_status_source_note_id: techPick.sourceNoteId,
    tech_status_source_meeting_date: techPick.sourceMeetingDate,
    path_to_tech_win: pathPick.value,
    path_to_tech_win_source_note_id: pathPick.sourceNoteId,
    next_milestone: milestonePick.value,
    what_changed: whatChangedPick.value,
    help_needed: helpPick.value,
    last_meeting_date: lastMeetingDate,
    last_update_at: lastUpdateAt,
    last_5_note_ids: last5NoteIds,
    open_action_items: openItems,
    overdue_action_items: overdueItems,
    blockers: [...blockers].slice(0, 10),
    competitors: [...competitors],
    momentum_score: momentum,
    escalation_recommended: escalationRecommended,
    escalation_severity: severity,
    computed_at: new Date().toISOString(),
  };

  return rollup;
}

/** Builds and persists the rollup. Returns the saved document. */
export async function computeOpportunityRollup(
  opp: OpportunityDocument,
): Promise<OpportunityRollupDocument> {
  const rollup = await buildOpportunityRollup(opp);
  await elasticService.upsertOpportunityRollup(opp.opp_id, rollup);
  return rollup;
}

export async function computeAllOpportunityRollups(): Promise<{
  count: number;
  reds: number;
  escalations: number;
}> {
  const opps = await elasticService.listOpportunities({ size: 2000 });
  let reds = 0;
  let escalations = 0;
  for (const opp of opps) {
    try {
      const r = await computeOpportunityRollup(opp);
      if (r.tech_status === "red") reds++;
      if (r.escalation_recommended) escalations++;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[opportunity-rollup-worker] Failed for ${opp.opp_id}:`, err);
    }
  }
  // eslint-disable-next-line no-console
  console.log(
    `[opportunity-rollup-worker] Computed ${opps.length} rollups (reds=${reds}, escalations=${escalations}) at ${new Date().toISOString()}`,
  );
  return { count: opps.length, reds, escalations };
}

/**
 * Builds the row format that mirrors the columns in
 * ignore_context/risk_tracker.md (Kevin's spreadsheet).
 */
export function buildRiskTrackerRow(
  opp: OpportunityDocument,
  rollup: OpportunityRollupDocument | null,
): Record<string, string | number | null> {
  return {
    Account: opp.account,
    Opportunity: opp.opp_name ?? "",
    ACV: opp.acv ?? 0,
    "Close Quarter": opp.close_quarter ?? "",
    Forecast: opp.forecast_category ?? "",
    "Sales Stage": opp.sales_stage ?? "",
    SE: opp.owner_se_email ?? "",
    AE: opp.owner_ae_email ?? "",
    Manager: opp.manager_email ?? "",
    Tier: opp.tier ?? "",
    "Tech Status (RYG)": rollup?.tech_status ?? "",
    "Tech Status Reason": rollup?.tech_status_reason ?? "",
    "Path to Tech Win": rollup?.path_to_tech_win ?? "",
    "Next Milestone Date": rollup?.next_milestone?.date ?? "",
    "Next Milestone": rollup?.next_milestone?.description ?? "",
    "What Changed": rollup?.what_changed ?? "",
    "Help Needed": rollup?.help_needed ?? "",
    "Last Meeting": rollup?.last_meeting_date ?? "",
    "Open Action Items": rollup?.open_action_items ?? 0,
    "Overdue Action Items": rollup?.overdue_action_items ?? 0,
  };
}
