import { elasticService } from "../elastic-instance.js";
import { writeMarkdownToDrive } from "../services/file-writer.js";
import type {
  OpportunityDocument,
  OpportunityRollupDocument,
} from "../services/elastic.js";

const COMMIT_THRESHOLD_ACV = 1_000_000;

export interface FridayDigestOptions {
  managerEmail?: string;
  ownerSeEmail?: string;
  /** ISO date for "this Friday" — defaults to most recent Friday at 16:00 local. */
  referenceDate?: string;
  /** When false, skip writing markdown files (still creates Inbox alerts). */
  writeFiles?: boolean;
}

export interface FridayDigestResult {
  reference_date: string;
  week_label: string;
  digests: Array<{
    kind: "se" | "manager";
    owner: string;
    manager_email?: string | null;
    owner_se_email?: string | null;
    opportunity_count: number;
    red_count: number;
    escalation_count: number;
    markdown_path: string | null;
    alert_created: boolean;
  }>;
  message: string;
}

interface OppWithRollup {
  opp: OpportunityDocument;
  rollup: OpportunityRollupDocument | null;
}

function fmtAcv(v: number | null | undefined): string {
  const n = typeof v === "number" && Number.isFinite(v) ? v : 0;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${n}`;
}

function fmtDate(v: string | null | undefined): string {
  return v ? v.slice(0, 10) : "—";
}

function isoWeekLabel(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function defaultReferenceDate(): Date {
  const now = new Date();
  const day = now.getDay();
  const diff = day >= 5 ? day - 5 : day + 2;
  const friday = new Date(now);
  friday.setDate(friday.getDate() - diff);
  friday.setHours(16, 0, 0, 0);
  return friday;
}

function lastWeekIso(reference: Date): string {
  const d = new Date(reference);
  d.setDate(d.getDate() - 7);
  return d.toISOString();
}

function daysSince(iso: string | null | undefined, ref: Date): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.floor((ref.getTime() - t) / (24 * 60 * 60 * 1000));
}

async function loadJoined(filters: {
  ownerSeEmail?: string;
  managerEmail?: string;
}): Promise<OppWithRollup[]> {
  const opps = await elasticService.listOpportunities({
    owner_se_email: filters.ownerSeEmail,
    manager_email: filters.managerEmail,
    size: 2000,
  });
  const rollups = await elasticService.searchOpportunityRollups({
    owner_se_email: filters.ownerSeEmail,
    manager_email: filters.managerEmail,
    size: 2000,
  });
  const byId = new Map<string, OpportunityRollupDocument>();
  for (const r of rollups) if (r.opp_id) byId.set(r.opp_id, r);
  return opps.map((opp) => ({ opp, rollup: byId.get(opp.opp_id) ?? null }));
}

function isCommitOrLarge(o: OppWithRollup): boolean {
  const forecast = (o.opp.forecast_category ?? "").toLowerCase();
  const acv = typeof o.opp.acv === "number" ? o.opp.acv : 0;
  return forecast === "commit" || acv >= COMMIT_THRESHOLD_ACV;
}

function isRed(o: OppWithRollup): boolean {
  return (o.rollup?.tech_status ?? "").toLowerCase() === "red";
}

function escalation(o: OppWithRollup): boolean {
  return Boolean(o.rollup?.escalation_recommended);
}

function rygDistribution(rows: OppWithRollup[]) {
  const out = { red: 0, yellow: 0, green: 0, none: 0 };
  for (const r of rows) {
    const s = (r.rollup?.tech_status ?? "").toLowerCase();
    if (s === "red") out.red++;
    else if (s === "yellow") out.yellow++;
    else if (s === "green") out.green++;
    else out.none++;
  }
  return out;
}

function topByAcv(rows: OppWithRollup[], n: number): OppWithRollup[] {
  return [...rows].sort((a, b) => (b.opp.acv ?? 0) - (a.opp.acv ?? 0)).slice(0, n);
}

function bullet(line: string): string {
  return `- ${line}`;
}

function rygTag(status: string | null | undefined): string {
  const s = (status ?? "").toLowerCase();
  if (s === "red") return "🔴 RED";
  if (s === "yellow") return "🟡 YELLOW";
  if (s === "green") return "🟢 GREEN";
  return "⚪ NONE";
}

function buildSeDigestMarkdown(opts: {
  ownerSe: string;
  reference: Date;
  rows: OppWithRollup[];
}): string {
  const { ownerSe, reference, rows } = opts;
  const week = isoWeekLabel(reference);
  const sinceIso = lastWeekIso(reference);

  const updatedThisWeek = rows.filter((r) => {
    const lm = r.rollup?.last_meeting_date ?? r.rollup?.last_update_at;
    return lm ? lm >= sinceIso : false;
  });
  const dist = rygDistribution(rows);
  const top5 = topByAcv(rows, 5);
  const reds = rows.filter(isRed).sort((a, b) => (b.opp.acv ?? 0) - (a.opp.acv ?? 0));
  const escalations = rows.filter(escalation).sort((a, b) => (b.opp.acv ?? 0) - (a.opp.acv ?? 0));
  const changed = rows.filter((r) => {
    const wc = r.rollup?.what_changed?.trim();
    const computed = r.rollup?.computed_at ?? "";
    return wc && computed >= sinceIso;
  });
  const hygiene = rows
    .map((r) => ({ row: r, days: daysSince(r.rollup?.last_meeting_date ?? null, reference) }))
    .filter((x) => x.days == null || x.days >= 7)
    .sort((a, b) => (b.row.opp.acv ?? 0) - (a.row.opp.acv ?? 0));
  const drafts = rows.filter((r) => isRed(r) || isCommitOrLarge(r));

  const lines: string[] = [];
  lines.push(`# Friday Digest — ${ownerSe} — ${week}`);
  lines.push("");
  lines.push(`_Reference Friday: ${reference.toISOString().slice(0, 10)} · Generated ${new Date().toISOString()}_`);
  lines.push("");

  lines.push("## 1. This week at a glance");
  lines.push("");
  lines.push(bullet(`${updatedThisWeek.length} opportunit${updatedThisWeek.length === 1 ? "y" : "ies"} updated since last Friday`));
  lines.push(bullet(`Total opportunities: ${rows.length}`));
  lines.push(
    bullet(
      `RYG distribution: 🔴 ${dist.red} · 🟡 ${dist.yellow} · 🟢 ${dist.green} · ⚪ ${dist.none}`,
    ),
  );
  lines.push(
    bullet(`Total ACV in scope: ${fmtAcv(rows.reduce((acc, r) => acc + (r.opp.acv ?? 0), 0))}`),
  );
  lines.push("");

  lines.push("## 2. Top of mind (by ACV)");
  lines.push("");
  if (top5.length === 0) {
    lines.push("_None._");
  } else {
    for (const r of top5) {
      const label = `${r.opp.account}${r.opp.opp_name ? ` — ${r.opp.opp_name}` : ""}`;
      lines.push(
        bullet(
          `${rygTag(r.rollup?.tech_status)} **${label}** · ${fmtAcv(r.opp.acv)} · ${
            r.opp.forecast_category ?? "—"
          } · last meeting ${fmtDate(r.rollup?.last_meeting_date)}`,
        ),
      );
    }
  }
  lines.push("");

  lines.push("## 3. Reds & escalations");
  lines.push("");
  if (reds.length === 0) {
    lines.push("_No red opportunities. Confirm rollups are fresh._");
  } else {
    for (const r of reds) {
      const label = `${r.opp.account}${r.opp.opp_name ? ` — ${r.opp.opp_name}` : ""}`;
      const flag = escalation(r) ? " · **ESCALATE**" : "";
      lines.push(
        bullet(
          `🔴 **${label}** · ${fmtAcv(r.opp.acv)} · ${r.opp.forecast_category ?? "—"}${flag}`,
        ),
      );
      if (r.rollup?.tech_status_reason) {
        lines.push(`  - Why red: ${r.rollup.tech_status_reason}`);
      }
      if (r.rollup?.path_to_tech_win) {
        lines.push(`  - Path to Tech Win: ${r.rollup.path_to_tech_win}`);
      }
      if (r.rollup?.help_needed) {
        lines.push(`  - Help needed: ${r.rollup.help_needed}`);
      }
    }
  }
  if (escalations.length > 0) {
    lines.push("");
    lines.push(
      `> ${escalations.length} escalation${escalations.length === 1 ? "" : "s"} recommended (red AND commit-or-≥$1M).`,
    );
  }
  lines.push("");

  lines.push("## 4. What changed since last Friday");
  lines.push("");
  if (changed.length === 0) {
    lines.push("_No tracked changes captured this week._");
  } else {
    for (const r of changed) {
      const label = `${r.opp.account}${r.opp.opp_name ? ` — ${r.opp.opp_name}` : ""}`;
      lines.push(bullet(`${rygTag(r.rollup?.tech_status)} **${label}** — ${r.rollup?.what_changed}`));
      const nm = r.rollup?.next_milestone;
      if (nm?.date || nm?.description) {
        lines.push(
          `  - Next milestone: ${nm.date ? fmtDate(nm.date) + " · " : ""}${nm.description ?? ""}`,
        );
      }
    }
  }
  lines.push("");

  lines.push("## 5. Hygiene gaps (no meeting in 7+ days)");
  lines.push("");
  if (hygiene.length === 0) {
    lines.push("_All opportunities have a recent touchpoint._");
  } else {
    for (const h of hygiene.slice(0, 15)) {
      const label = `${h.row.opp.account}${h.row.opp.opp_name ? ` — ${h.row.opp.opp_name}` : ""}`;
      const stale = h.days == null ? "never" : `${h.days}d stale`;
      lines.push(bullet(`${label} · ${fmtAcv(h.row.opp.acv)} · ${stale}`));
    }
    if (hygiene.length > 15) {
      lines.push(bullet(`_…and ${hygiene.length - 15} more._`));
    }
  }
  lines.push("");

  lines.push("## 6. Drafted 1-2-3s for Salesforce");
  lines.push("");
  if (drafts.length === 0) {
    lines.push("_Nothing requires a 1-2-3 update this week._");
  } else {
    for (const r of drafts.slice(0, 10)) {
      const label = `${r.opp.account}${r.opp.opp_name ? ` — ${r.opp.opp_name}` : ""}`;
      lines.push(`### ${label} (${fmtAcv(r.opp.acv)} · ${r.opp.forecast_category ?? "—"})`);
      lines.push("");
      lines.push("**1. Tech win status**");
      lines.push("");
      const reason = r.rollup?.tech_status_reason ?? "";
      const path = r.rollup?.path_to_tech_win ?? "";
      lines.push(
        `${rygTag(r.rollup?.tech_status)} — ${reason || "Reason TBD."} ${
          path ? `Path to Tech Win: ${path}` : ""
        }`.trim(),
      );
      lines.push("");
      lines.push("**2. What we did this week**");
      lines.push("");
      lines.push(
        r.rollup?.what_changed?.trim()
          ? r.rollup.what_changed.trim()
          : `Met with ${r.opp.account}; latest meeting on ${fmtDate(r.rollup?.last_meeting_date)}. Update with concrete progress.`,
      );
      lines.push("");
      lines.push("**3. What we are doing next**");
      lines.push("");
      const nm = r.rollup?.next_milestone;
      if (nm?.date || nm?.description) {
        lines.push(`${nm?.description ?? "Next milestone"}${nm?.date ? ` (${fmtDate(nm.date)})` : ""}.`);
      } else {
        lines.push("Schedule next milestone with the customer (date + concrete deliverable).");
      }
      lines.push("");
    }
    if (drafts.length > 10) {
      lines.push(`_…and ${drafts.length - 10} more drafts available via \`generate_opportunity_123\`._`);
      lines.push("");
    }
  }

  lines.push("---");
  lines.push("");
  lines.push("_Generated by the Friday Digest worker. Update notes in Granola or the Enrich panel to refresh._");

  return lines.join("\n") + "\n";
}

function buildManagerDigestMarkdown(opts: {
  managerEmail: string;
  reference: Date;
  rows: OppWithRollup[];
  perSe: Map<string, OppWithRollup[]>;
}): string {
  const { managerEmail, reference, rows, perSe } = opts;
  const week = isoWeekLabel(reference);
  const dist = rygDistribution(rows);
  const escalations = rows.filter(escalation).sort((a, b) => (b.opp.acv ?? 0) - (a.opp.acv ?? 0));
  const top10 = topByAcv(rows, 10);

  const lines: string[] = [];
  lines.push(`# Friday Digest — Manager rollup for ${managerEmail} — ${week}`);
  lines.push("");
  lines.push(`_Reference Friday: ${reference.toISOString().slice(0, 10)} · Generated ${new Date().toISOString()}_`);
  lines.push("");

  lines.push("## Headline");
  lines.push("");
  lines.push(
    bullet(
      `${rows.length} opportunities · ${fmtAcv(rows.reduce((a, r) => a + (r.opp.acv ?? 0), 0))} ACV`,
    ),
  );
  lines.push(
    bullet(
      `RYG: 🔴 ${dist.red} · 🟡 ${dist.yellow} · 🟢 ${dist.green} · ⚪ ${dist.none}`,
    ),
  );
  lines.push(bullet(`${escalations.length} escalation${escalations.length === 1 ? "" : "s"} recommended this week`));
  lines.push("");

  lines.push("## Exec escalation queue");
  lines.push("");
  if (escalations.length === 0) {
    lines.push("_No escalations._");
  } else {
    for (const r of escalations) {
      const label = `${r.opp.account}${r.opp.opp_name ? ` — ${r.opp.opp_name}` : ""}`;
      lines.push(
        bullet(
          `🔴 **${label}** · ${fmtAcv(r.opp.acv)} · ${r.opp.forecast_category ?? "—"} · SE ${
            r.opp.owner_se_email ?? "—"
          }`,
        ),
      );
      if (r.rollup?.tech_status_reason) lines.push(`  - ${r.rollup.tech_status_reason}`);
      if (r.rollup?.path_to_tech_win) lines.push(`  - Path: ${r.rollup.path_to_tech_win}`);
    }
  }
  lines.push("");

  lines.push("## Top 10 by ACV");
  lines.push("");
  for (const r of top10) {
    const label = `${r.opp.account}${r.opp.opp_name ? ` — ${r.opp.opp_name}` : ""}`;
    lines.push(
      bullet(
        `${rygTag(r.rollup?.tech_status)} **${label}** · ${fmtAcv(r.opp.acv)} · ${
          r.opp.forecast_category ?? "—"
        } · ${r.opp.owner_se_email ?? "—"}`,
      ),
    );
  }
  lines.push("");

  lines.push("## Hygiene leaderboard");
  lines.push("");
  const hygiene: Array<{ se: string; total: number; stale: number; staleAcv: number }> = [];
  for (const [se, list] of perSe) {
    let stale = 0;
    let staleAcv = 0;
    for (const r of list) {
      const days = daysSince(r.rollup?.last_meeting_date ?? null, reference);
      if (days == null || days >= 7) {
        stale++;
        staleAcv += r.opp.acv ?? 0;
      }
    }
    hygiene.push({ se, total: list.length, stale, staleAcv });
  }
  hygiene.sort((a, b) => b.stale - a.stale);
  if (hygiene.length === 0) {
    lines.push("_No SEs to score._");
  } else {
    for (const h of hygiene) {
      lines.push(
        bullet(
          `${h.se} — ${h.stale}/${h.total} opps stale (${fmtAcv(h.staleAcv)} at risk of going dark)`,
        ),
      );
    }
  }
  lines.push("");

  lines.push("## Per-SE rollup");
  lines.push("");
  for (const [se, list] of perSe) {
    const d = rygDistribution(list);
    lines.push(
      bullet(
        `**${se}** — ${list.length} opps · 🔴 ${d.red} · 🟡 ${d.yellow} · 🟢 ${d.green} · ${
          list.filter(escalation).length
        } escalations`,
      ),
    );
  }
  lines.push("");

  lines.push("---");
  lines.push("");
  lines.push("_Aggregated from per-SE digests by the Friday Digest worker._");

  return lines.join("\n") + "\n";
}

function safeOwner(email: string): string {
  return email.replace(/[^a-zA-Z0-9._@-]/g, "_");
}

async function emitInboxAlert(opts: {
  alertType: "friday_digest" | "friday_digest_manager";
  owner: string;
  account: string;
  message: string;
  metadata: Record<string, unknown>;
  weekLabel: string;
}): Promise<boolean> {
  const result = await elasticService.createAlert({
    alert_type: opts.alertType,
    account: opts.account,
    owner: opts.owner,
    severity: "low",
    message: opts.message,
    dedup_key: `${opts.alertType}_${opts.owner}_${opts.weekLabel}`,
    metadata: opts.metadata,
  });
  return result.created;
}

export async function runFridayDigest(
  options: FridayDigestOptions = {},
): Promise<FridayDigestResult> {
  const reference = options.referenceDate
    ? new Date(options.referenceDate)
    : defaultReferenceDate();
  if (Number.isNaN(reference.getTime())) {
    throw new Error(`Invalid reference_date: ${options.referenceDate}`);
  }
  const week = isoWeekLabel(reference);
  const writeFiles = options.writeFiles !== false;
  const drivePath = (process.env.DRIVE_NOTES_PATH ?? "").trim();
  const drivePathAvailable = writeFiles && drivePath.length > 0;
  const relativeDir = `_Digests/${week}`;

  const allRows = await loadJoined({
    ownerSeEmail: options.ownerSeEmail,
    managerEmail: options.managerEmail,
  });

  const bySe = new Map<string, OppWithRollup[]>();
  const byManager = new Map<string, OppWithRollup[]>();
  const byManagerSe = new Map<string, Map<string, OppWithRollup[]>>();
  for (const r of allRows) {
    const se = (r.opp.owner_se_email ?? "").toLowerCase();
    if (se) {
      if (!bySe.has(se)) bySe.set(se, []);
      bySe.get(se)!.push(r);
    }
    const mgr = (r.opp.manager_email ?? "").toLowerCase();
    if (mgr) {
      if (!byManager.has(mgr)) byManager.set(mgr, []);
      byManager.get(mgr)!.push(r);
      if (!byManagerSe.has(mgr)) byManagerSe.set(mgr, new Map());
      const inner = byManagerSe.get(mgr)!;
      if (se) {
        if (!inner.has(se)) inner.set(se, []);
        inner.get(se)!.push(r);
      }
    }
  }

  const digests: FridayDigestResult["digests"] = [];

  for (const [se, rows] of bySe) {
    const md = buildSeDigestMarkdown({ ownerSe: se, reference, rows });
    let writtenPath: string | null = null;
    if (drivePathAvailable) {
      try {
        writtenPath = writeMarkdownToDrive({
          drivePath,
          relativeDir,
          fileName: `se-${safeOwner(se)}.md`,
          markdown: md,
        });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(`[friday-digest-worker] Failed to write SE digest for ${se}:`, e);
      }
    }
    const dist = rygDistribution(rows);
    const escalCount = rows.filter(escalation).length;
    const alertCreated = await emitInboxAlert({
      alertType: "friday_digest",
      owner: se,
      account: "(team)",
      message: `Friday digest ${week}: ${rows.length} opps · 🔴 ${dist.red} · 🟡 ${dist.yellow} · 🟢 ${dist.green} · ${escalCount} escalations.`,
      metadata: {
        week_label: week,
        reference_date: reference.toISOString(),
        opportunity_count: rows.length,
        red_count: dist.red,
        escalation_count: escalCount,
        markdown_path: writtenPath,
        markdown: md,
      },
      weekLabel: week,
    });
    digests.push({
      kind: "se",
      owner: se,
      owner_se_email: se,
      manager_email: rows[0]?.opp.manager_email ?? null,
      opportunity_count: rows.length,
      red_count: dist.red,
      escalation_count: escalCount,
      markdown_path: writtenPath,
      alert_created: alertCreated,
    });
  }

  for (const [mgr, rows] of byManager) {
    const inner = byManagerSe.get(mgr) ?? new Map();
    const md = buildManagerDigestMarkdown({
      managerEmail: mgr,
      reference,
      rows,
      perSe: inner,
    });
    let writtenPath: string | null = null;
    if (drivePathAvailable) {
      try {
        writtenPath = writeMarkdownToDrive({
          drivePath,
          relativeDir,
          fileName: `manager-${safeOwner(mgr)}.md`,
          markdown: md,
        });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(`[friday-digest-worker] Failed to write manager digest for ${mgr}:`, e);
      }
    }
    const dist = rygDistribution(rows);
    const escalCount = rows.filter(escalation).length;
    const alertCreated = await emitInboxAlert({
      alertType: "friday_digest_manager",
      owner: mgr,
      account: "(team)",
      message: `Friday digest ${week} (manager rollup): ${rows.length} opps · 🔴 ${dist.red} · 🟡 ${dist.yellow} · 🟢 ${dist.green} · ${escalCount} escalations across ${inner.size} SE${inner.size === 1 ? "" : "s"}.`,
      metadata: {
        week_label: week,
        reference_date: reference.toISOString(),
        opportunity_count: rows.length,
        red_count: dist.red,
        escalation_count: escalCount,
        se_count: inner.size,
        markdown_path: writtenPath,
        markdown: md,
      },
      weekLabel: week,
    });
    digests.push({
      kind: "manager",
      owner: mgr,
      manager_email: mgr,
      opportunity_count: rows.length,
      red_count: dist.red,
      escalation_count: escalCount,
      markdown_path: writtenPath,
      alert_created: alertCreated,
    });
  }

  const message = drivePathAvailable
    ? `Generated ${digests.length} digest${digests.length === 1 ? "" : "s"} (week ${week}); written to ${relativeDir} and Inbox.`
    : `Generated ${digests.length} digest${digests.length === 1 ? "" : "s"} (week ${week}); Inbox only — DRIVE_NOTES_PATH is not configured.`;

  // eslint-disable-next-line no-console
  console.log(`[friday-digest-worker] ${message}`);

  return {
    reference_date: reference.toISOString(),
    week_label: week,
    digests,
    message,
  };
}
