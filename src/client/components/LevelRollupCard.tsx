import { Link } from "react-router-dom";

export interface LevelRollupRow {
  opp_id: string;
  account: string;
  opp_name: string;
  acv: number | null;
  forecast_category: string | null;
  tech_status: string | null;
  tech_status_reason: string | null;
  path_to_tech_win: string | null;
  last_meeting_date: string | null;
  owner_se_email: string | null;
  owner_ae_email: string | null;
  manager_email: string | null;
  tier: string | null;
  escalation_recommended: boolean;
}

export interface LevelRollupGroup {
  /** Subordinate identity — e.g. manager_email, director_email, owner_ae_email. */
  key: string;
  /** Human label (defaults to key). */
  label?: string;
  /** What level this card represents (used for the "drill-into" link target). */
  drillRole: "manager" | "director" | "ae";
  rows: LevelRollupRow[];
}

function fmtAcv(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "$0";
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${Math.round(v / 1000)}k`;
  return `$${v}`;
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.floor((Date.now() - t) / (24 * 60 * 60 * 1000));
}

function rygPill(status: string | null) {
  const s = (status ?? "").toLowerCase();
  if (s === "red")
    return "bg-rose-100 text-rose-900 ring-rose-200 dark:bg-rose-500/20 dark:text-rose-200 dark:ring-rose-500/40";
  if (s === "yellow")
    return "bg-amber-100 text-amber-950 ring-amber-200 dark:bg-amber-500/20 dark:text-amber-200 dark:ring-amber-500/40";
  if (s === "green")
    return "bg-emerald-100 text-emerald-900 ring-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-200 dark:ring-emerald-500/40";
  return "bg-slate-100 text-slate-500 ring-slate-200 dark:bg-slate-700/40 dark:text-slate-300 dark:ring-slate-600";
}

interface RygCounts {
  red: number;
  yellow: number;
  green: number;
  none: number;
  total: number;
  acvSum: number;
  escalations: number;
  stale7d: number;
}

function summarize(rows: LevelRollupRow[]): RygCounts {
  const out: RygCounts = {
    red: 0,
    yellow: 0,
    green: 0,
    none: 0,
    total: rows.length,
    acvSum: 0,
    escalations: 0,
    stale7d: 0,
  };
  for (const r of rows) {
    out.acvSum += r.acv ?? 0;
    if (r.escalation_recommended) out.escalations++;
    const ds = daysSince(r.last_meeting_date);
    if (ds == null || ds >= 7) out.stale7d++;
    const s = (r.tech_status ?? "").toLowerCase();
    if (s === "red") out.red++;
    else if (s === "yellow") out.yellow++;
    else if (s === "green") out.green++;
    else out.none++;
  }
  return out;
}

/**
 * RYG distribution rendered as a horizontal stacked bar so a leader can scan
 * 5+ direct reports at a glance and instantly see who has more reds.
 */
function RygBar({ counts }: { counts: RygCounts }) {
  const total = Math.max(1, counts.total);
  const seg = (n: number, cls: string) =>
    n > 0 ? (
      <div className={cls} style={{ width: `${(n / total) * 100}%` }} title={`${n}`} />
    ) : null;
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
      {seg(counts.red, "bg-rose-500")}
      {seg(counts.yellow, "bg-amber-400")}
      {seg(counts.green, "bg-emerald-500")}
      {seg(counts.none, "bg-slate-300 dark:bg-slate-600")}
    </div>
  );
}

/**
 * One card per subordinate (manager / director / AE). Each card is a
 * rollup-of-rollups: counts, RYG bar, ACV total, top-3 deals, and a drill-in
 * link that hands off to the lower-level dashboard pre-filtered to this person.
 */
export function LevelRollupCard({ group }: { group: LevelRollupGroup }) {
  const counts = summarize(group.rows);
  const top3 = [...group.rows]
    .sort((a, b) => {
      // Escalations first, then ACV desc — what the leader looks at first.
      if (a.escalation_recommended !== b.escalation_recommended) {
        return a.escalation_recommended ? -1 : 1;
      }
      return (b.acv ?? 0) - (a.acv ?? 0);
    })
    .slice(0, 3);

  const drillHref =
    group.drillRole === "manager"
      ? `/manager?manager_email=${encodeURIComponent(group.key)}`
      : group.drillRole === "director"
        ? `/director?director_email=${encodeURIComponent(group.key)}`
        : `/sales-rvp?owner_ae_email=${encodeURIComponent(group.key)}`;

  return (
    <article className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            {group.label ?? group.key}
          </h3>
          <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400">{group.key}</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{fmtAcv(counts.acvSum)}</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {counts.total} opp{counts.total === 1 ? "" : "s"}
          </p>
        </div>
      </header>

      <div className="mt-3">
        <RygBar counts={counts} />
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-600 dark:text-slate-300">
          <span>
            <span className="font-mono text-rose-700 dark:text-rose-300">{counts.red}</span> red
          </span>
          <span>
            <span className="font-mono text-amber-700 dark:text-amber-300">{counts.yellow}</span> yellow
          </span>
          <span>
            <span className="font-mono text-emerald-700 dark:text-emerald-300">{counts.green}</span> green
          </span>
          {counts.none > 0 ? (
            <span>
              <span className="font-mono text-slate-500 dark:text-slate-400">{counts.none}</span> no-status
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <div className="rounded-lg bg-rose-50 px-2.5 py-1.5 dark:bg-rose-500/10">
          <p className="text-rose-700 dark:text-rose-300">Escalations</p>
          <p className="text-base font-semibold text-rose-900 dark:text-rose-200">{counts.escalations}</p>
        </div>
        <div className="rounded-lg bg-slate-50 px-2.5 py-1.5 dark:bg-slate-800">
          <p className="text-slate-600 dark:text-slate-300">Stale ≥7d</p>
          <p className="text-base font-semibold text-slate-900 dark:text-white">{counts.stale7d}</p>
        </div>
      </div>

      {top3.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {top3.map((r) => (
            <li key={r.opp_id} className="flex items-start gap-2 text-xs">
              <span
                className={`inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ${rygPill(r.tech_status)}`}
              >
                {(r.tech_status ?? "—").toString().toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-slate-900 dark:text-slate-100">
                  {r.account}
                  {r.opp_name ? ` · ${r.opp_name}` : ""}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {fmtAcv(r.acv)} · {r.forecast_category ?? "—"}
                  {r.escalation_recommended ? " · escalation" : ""}
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <Link
        to={drillHref}
        className="mt-3 inline-block text-xs font-medium text-slate-700 hover:underline dark:text-slate-300"
      >
        Open this {group.drillRole === "ae" ? "AE's" : `${group.drillRole}'s`} dashboard →
      </Link>
    </article>
  );
}

export type { RygCounts };
export { summarize as summarizeRyg, fmtAcv as fmtAcvHelper, daysSince as daysSinceHelper };
