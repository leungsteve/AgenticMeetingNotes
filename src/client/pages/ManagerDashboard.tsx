import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getJson, postJson } from "../lib/api.js";
import { getSessionUserEmail } from "../lib/session.js";
import type { AgentAlert } from "../types/index.js";

interface ManagerOpportunityRow {
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

function resolveActingUser(): string {
  return getSessionUserEmail() ?? "";
}

interface OpportunityLite {
  opp_id: string;
  manager_email?: string | null;
  owner_se_email?: string | null;
}

/**
 * Pick the right manager_email to seed the filter with:
 *   1. If the session user manages anyone (i.e., shows up as `manager_email`
 *      on at least one opportunity), use them.
 *   2. Otherwise, if the session user owns any opportunities as the SE, take
 *      the manager_email from the first one (i.e., look up "my manager").
 *   3. Otherwise return "" — the dashboard will load all opportunities
 *      across every manager so the user can see something useful.
 */
async function autoResolveManager(actingEmail: string): Promise<string> {
  if (!actingEmail) return "";
  try {
    const res = await getJson<{ opportunities: OpportunityLite[] }>(
      "/api/opportunities?size=500",
    );
    const opps = res.opportunities ?? [];
    const lower = actingEmail.toLowerCase();
    const managesAnyone = opps.some(
      (o) => (o.manager_email ?? "").toLowerCase() === lower,
    );
    if (managesAnyone) return actingEmail;
    const ownedAsSe = opps.find(
      (o) => (o.owner_se_email ?? "").toLowerCase() === lower,
    );
    if (ownedAsSe?.manager_email) return ownedAsSe.manager_email;
    return "";
  } catch {
    return actingEmail;
  }
}

function fmtAcv(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "";
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

function rygDot(status: string | null) {
  const s = (status ?? "").toLowerCase();
  if (s === "red") return "bg-rose-500";
  if (s === "yellow") return "bg-amber-400";
  if (s === "green") return "bg-emerald-500";
  return "bg-slate-300";
}

function rygPill(status: string | null) {
  const s = (status ?? "").toLowerCase();
  if (s === "red") return "bg-rose-100 text-rose-900 ring-rose-200";
  if (s === "yellow") return "bg-amber-100 text-amber-950 ring-amber-200";
  if (s === "green") return "bg-emerald-100 text-emerald-900 ring-emerald-200";
  return "bg-slate-100 text-slate-500 ring-slate-200";
}

export default function ManagerDashboard() {
  const acting = resolveActingUser();
  const [managerEmail, setManagerEmail] = useState<string>(acting);
  const [autoResolved, setAutoResolved] = useState<{
    from: string;
    to: string;
  } | null>(null);
  const [allRows, setAllRows] = useState<ManagerOpportunityRow[]>([]);
  const [escalations, setEscalations] = useState<AgentAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const resolved = await autoResolveManager(acting);
      if (cancelled) return;
      if (resolved && resolved.toLowerCase() !== acting.toLowerCase()) {
        setManagerEmail(resolved);
        setAutoResolved({ from: acting, to: resolved });
      } else if (!resolved && acting) {
        setManagerEmail("");
        setAutoResolved({ from: acting, to: "" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [acting]);

  const load = useCallback(
    async (mgr: string) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (mgr) params.set("manager_email", mgr);
        const [riskRes, alertsRes] = await Promise.all([
          getJson<{ rows: ManagerOpportunityRow[]; count: number }>(
            `/api/risk-tracker${params.toString() ? `?${params.toString()}` : ""}`,
          ),
          mgr
            ? getJson<{ alerts: AgentAlert[] }>(
                `/api/alerts?owner=${encodeURIComponent(mgr)}&size=200`,
              ).catch(() => ({ alerts: [] }))
            : Promise.resolve({ alerts: [] }),
        ]);
        setAllRows(riskRes.rows);
        const opportunityHigh = (alertsRes.alerts ?? []).filter(
          (a) => a.alert_type === "opportunity_at_risk" && a.severity === "high",
        );
        setEscalations(opportunityHigh);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load manager dashboard");
        setAllRows([]);
        setEscalations([]);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void load(managerEmail);
  }, [load, managerEmail]);

  const tier1 = useMemo(() => allRows.filter((r) => r.tier === "1"), [allRows]);
  const reds = useMemo(
    () =>
      [...allRows]
        .filter((r) => (r.tech_status ?? "").toLowerCase() === "red")
        .sort((a, b) => (b.acv ?? 0) - (a.acv ?? 0)),
    [allRows],
  );
  const top10 = useMemo(
    () => [...allRows].sort((a, b) => (b.acv ?? 0) - (a.acv ?? 0)).slice(0, 10),
    [allRows],
  );
  const hygieneGaps = useMemo(() => {
    const gaps: Array<{ se: string; rows: ManagerOpportunityRow[] }> = [];
    const bySe = new Map<string, ManagerOpportunityRow[]>();
    for (const r of allRows) {
      const since = daysSince(r.last_meeting_date);
      if (since == null || since >= 7) {
        const se = r.owner_se_email ?? "(unassigned)";
        if (!bySe.has(se)) bySe.set(se, []);
        bySe.get(se)!.push(r);
      }
    }
    for (const [se, rows] of bySe) {
      gaps.push({ se, rows: rows.sort((a, b) => (b.acv ?? 0) - (a.acv ?? 0)) });
    }
    gaps.sort((a, b) => b.rows.length - a.rows.length);
    return gaps;
  }, [allRows]);

  const escalationRows = useMemo(
    () =>
      [...allRows]
        .filter((r) => r.escalation_recommended)
        .sort((a, b) => (b.acv ?? 0) - (a.acv ?? 0)),
    [allRows],
  );

  const counts = useMemo(() => {
    const out = { red: 0, yellow: 0, green: 0, none: 0 };
    for (const r of allRows) {
      const s = (r.tech_status ?? "").toLowerCase();
      if (s === "red") out.red++;
      else if (s === "yellow") out.yellow++;
      else if (s === "green") out.green++;
      else out.none++;
    }
    return out;
  }, [allRows]);

  const onRunDigest = async () => {
    setBusy(true);
    try {
      const body = managerEmail ? { manager_email: managerEmail } : {};
      const res = await postJson<{
        digests?: Array<{ owner_se_email?: string; manager_email?: string; markdown_path?: string }>;
        message?: string;
      }>("/api/digest/run", body);
      const count = res.digests?.length ?? 0;
      alert(
        `Generated ${count} digest${count === 1 ? "" : "s"}.${res.message ? ` ${res.message}` : ""}`,
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to run digest");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Manager Dashboard
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
            Your team at a glance
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Five panels surface the work only a manager cares about: Tier-1 accounts, every red,
            top 10 by ACV, hygiene gaps, and the executive escalation queue.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-slate-600">
            Manager
            <input
              value={managerEmail}
              onChange={(e) => setManagerEmail(e.target.value)}
              placeholder="ed.salazar@elastic.co"
              className="ml-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
            />
          </label>
          <button
            type="button"
            onClick={onRunDigest}
            disabled={busy}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {busy ? "Running…" : "Run Friday digest"}
          </button>
        </div>
      </header>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
          {error}
        </div>
      ) : null}

      {autoResolved ? (
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900">
          {autoResolved.to ? (
            <>
              You're signed in as <span className="font-mono">{autoResolved.from}</span>, who is not
              a manager in the opportunity index. Showing the dashboard for your manager{" "}
              <span className="font-mono">{autoResolved.to}</span>. Override above if you'd rather
              see a different manager's view.
            </>
          ) : (
            <>
              You're signed in as <span className="font-mono">{autoResolved.from}</span>, who is
              not listed as a manager and has no opportunities in the spine. Showing every
              opportunity across all managers. Type a manager email above to filter.
            </>
          )}
        </div>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-4">
        <Stat label="Opportunities" value={allRows.length} />
        <Stat label="Red" value={counts.red} accent="text-rose-700" />
        <Stat label="Yellow" value={counts.yellow} accent="text-amber-700" />
        <Stat
          label="Escalations (high)"
          value={escalationRows.length}
          accent="text-rose-700"
        />
      </section>

      <Panel
        title="Exec escalation queue"
        subtitle="High-severity opportunity_at_risk alerts: red AND (commit OR ACV ≥ $1M). Bring these to Kevin first."
      >
        {escalationRows.length === 0 ? (
          <Empty text="No escalations. Nice." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {escalationRows.map((r) => (
              <li key={r.opp_id} className="flex flex-wrap items-start gap-3 py-2">
                <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${rygDot(r.tech_status)}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900">
                    {r.account}
                    {r.opp_name ? ` · ${r.opp_name}` : ""}{" "}
                    <span className="font-mono text-xs text-slate-500">{fmtAcv(r.acv)}</span>{" "}
                    <span className="text-xs uppercase text-slate-500">
                      {r.forecast_category}
                    </span>
                  </p>
                  <p className="text-xs text-slate-600">
                    SE: {r.owner_se_email ?? "—"} · Last meeting{" "}
                    {r.last_meeting_date ? r.last_meeting_date.slice(0, 10) : "never"}
                  </p>
                  {r.tech_status_reason ? (
                    <p className="mt-1 text-xs text-rose-900">{r.tech_status_reason}</p>
                  ) : null}
                </div>
                <Link
                  to={`/risk?account=${encodeURIComponent(r.account)}`}
                  className="shrink-0 text-xs font-medium text-slate-700 hover:underline"
                >
                  Open in Risk Tracker →
                </Link>
              </li>
            ))}
          </ul>
        )}
        {escalations.length > 0 ? (
          <p className="mt-3 text-[11px] text-slate-500">
            {escalations.length} matching alert{escalations.length === 1 ? "" : "s"} in your Inbox.
          </p>
        ) : null}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="All reds across the team"
          subtitle="Sorted by ACV. The list a manager triages first thing every morning."
        >
          {reds.length === 0 ? (
            <Empty text="No red opportunities. (Suspicious — make sure rollups are fresh.)" />
          ) : (
            <RowList rows={reds} showReason />
          )}
        </Panel>

        <Panel
          title="Top 10 opportunities by ACV"
          subtitle="With current Tech Status RYG. The same 10 Kevin asks about."
        >
          {top10.length === 0 ? (
            <Empty text="No opportunities loaded." />
          ) : (
            <RowList rows={top10} />
          )}
        </Panel>

        <Panel
          title="Tier-1 accounts at-a-glance"
          subtitle="Every opportunity on a Tier-1 account, regardless of forecast."
        >
          {tier1.length === 0 ? (
            <Empty text="No Tier-1 opportunities for this manager." />
          ) : (
            <RowList rows={tier1} />
          )}
        </Panel>

        <Panel
          title="Hygiene leaderboard"
          subtitle="Which SEs haven't updated which opportunities in 7+ days?"
        >
          {hygieneGaps.length === 0 ? (
            <Empty text="Everyone's caught up." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {hygieneGaps.map((g) => (
                <li key={g.se} className="py-2">
                  <p className="text-sm font-medium text-slate-900">
                    {g.se}{" "}
                    <span className="text-xs font-normal text-slate-500">
                      · {g.rows.length} stale opp{g.rows.length === 1 ? "" : "s"}
                    </span>
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {g.rows.slice(0, 5).map((r) => {
                      const ds = daysSince(r.last_meeting_date);
                      return (
                        <li key={r.opp_id} className="text-xs text-slate-600">
                          {r.account}
                          {r.opp_name ? ` · ${r.opp_name}` : ""} —{" "}
                          {ds == null ? "never" : `${ds}d`} stale ·{" "}
                          <span className="font-mono text-slate-500">{fmtAcv(r.acv)}</span>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {loading ? <p className="text-xs text-slate-500">Loading latest rollups…</p> : null}
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${accent ?? "text-slate-900"}`}>{value}</p>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
      <header className="mb-2">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p> : null}
      </header>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-2 text-xs text-slate-500">{text}</p>;
}

function RowList({
  rows,
  showReason,
}: {
  rows: ManagerOpportunityRow[];
  showReason?: boolean;
}) {
  return (
    <ul className="divide-y divide-slate-100">
      {rows.map((r) => (
        <li key={r.opp_id} className="flex flex-wrap items-start gap-2 py-2">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${rygPill(r.tech_status)}`}
          >
            {(r.tech_status ?? "—").toString().toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-900">
              {r.account}
              {r.opp_name ? ` · ${r.opp_name}` : ""}{" "}
              <span className="font-mono text-xs text-slate-500">{fmtAcv(r.acv)}</span>
            </p>
            <p className="text-xs text-slate-600">
              SE: {r.owner_se_email ?? "—"} · {r.forecast_category ?? "—"} ·{" "}
              {r.close_quarter ?? "—"}
            </p>
            {showReason && r.tech_status_reason ? (
              <p className="mt-1 text-xs text-slate-700">{r.tech_status_reason}</p>
            ) : null}
            {r.path_to_tech_win ? (
              <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">
                Path: {r.path_to_tech_win}
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
