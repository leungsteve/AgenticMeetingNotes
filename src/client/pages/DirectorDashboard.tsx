import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getJson } from "../lib/api.js";
import { getSessionUserEmail } from "../lib/session.js";
import Combobox, { type ComboboxOption } from "../components/Combobox.js";
import {
  LevelRollupCard,
  fmtAcvHelper,
  summarizeRyg,
  type LevelRollupRow,
} from "../components/LevelRollupCard.js";

interface DashboardRow extends LevelRollupRow {
  director_email: string | null;
  vp_email: string | null;
  rvp_email: string | null;
  avp_email: string | null;
  close_quarter: string | null;
  sales_stage: string | null;
  next_milestone_date: string | null;
  next_milestone_description: string | null;
  what_changed: string | null;
  help_needed: string | null;
  open_action_items: number | null;
  overdue_action_items: number | null;
  blockers: string[];
  competitors: string[];
  escalation_severity: string | null;
  computed_at: string | null;
  has_rollup: boolean;
}

interface OpportunityLite {
  director_email?: string | null;
  manager_email?: string | null;
  owner_se_email?: string | null;
}

/**
 * Auto-resolve the right director_email to seed the filter:
 *   1. If the session user is themselves a director, use them.
 *   2. If they're a manager whose director is in the spine, use that director.
 *   3. If they're an SE whose manager has a director, use that director.
 *   4. Otherwise blank — show every director.
 */
async function autoResolveDirector(actingEmail: string): Promise<string> {
  if (!actingEmail) return "";
  try {
    const res = await getJson<{ opportunities: OpportunityLite[] }>(
      "/api/opportunities?size=500",
    );
    const opps = res.opportunities ?? [];
    const lower = actingEmail.toLowerCase();
    const isDirector = opps.some(
      (o) => (o.director_email ?? "").toLowerCase() === lower,
    );
    if (isDirector) return actingEmail;
    const asManager = opps.find((o) => (o.manager_email ?? "").toLowerCase() === lower);
    if (asManager?.director_email) return asManager.director_email;
    const asSe = opps.find((o) => (o.owner_se_email ?? "").toLowerCase() === lower);
    if (asSe?.director_email) return asSe.director_email;
    return "";
  } catch {
    return "";
  }
}

function rygPill(status: string | null) {
  const s = (status ?? "").toLowerCase();
  if (s === "red") return "bg-rose-100 dark:bg-rose-500/20 text-rose-900 dark:text-rose-200 ring-rose-200 dark:ring-rose-500/40";
  if (s === "yellow") return "bg-amber-100 dark:bg-amber-500/20 text-amber-950 dark:text-amber-200 ring-amber-200 dark:ring-amber-500/40";
  if (s === "green") return "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-900 dark:text-emerald-200 ring-emerald-200 dark:ring-emerald-500/40";
  return "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 ring-slate-200 dark:ring-slate-700";
}

export default function DirectorDashboard() {
  const acting = getSessionUserEmail() ?? "";
  const [searchParams, setSearchParams] = useSearchParams();
  const initialDirector = (searchParams.get("director_email") ?? "").trim();
  const [directorEmail, setDirectorEmail] = useState<string>(initialDirector || acting);
  const [autoResolved, setAutoResolved] = useState<{ from: string; to: string } | null>(null);
  const [allRows, setAllRows] = useState<DashboardRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allDirectors, setAllDirectors] = useState<ComboboxOption[]>([]);

  // Pull every distinct director_email so the picker shows demo personas even
  // if the session user isn't a director.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await getJson<{ opportunities: OpportunityLite[] }>(
          "/api/opportunities?size=500",
        );
        if (cancelled) return;
        const seen = new Map<string, number>();
        for (const o of res.opportunities ?? []) {
          const email = (o.director_email ?? "").toLowerCase().trim();
          if (!email) continue;
          seen.set(email, (seen.get(email) ?? 0) + 1);
        }
        const opts: ComboboxOption[] = Array.from(seen.entries())
          .map(([email, count]) => ({
            value: email,
            label: email,
            hint: `${count} opp${count === 1 ? "" : "s"}`,
          }))
          .sort((a, b) => a.value.localeCompare(b.value));
        setAllDirectors(opts);
      } catch {
        // non-fatal
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-resolve only if the URL didn't pin a director.
  useEffect(() => {
    if (initialDirector) return;
    let cancelled = false;
    void (async () => {
      const resolved = await autoResolveDirector(acting);
      if (cancelled) return;
      if (resolved && resolved.toLowerCase() !== acting.toLowerCase()) {
        setDirectorEmail(resolved);
        setAutoResolved({ from: acting, to: resolved });
      } else if (!resolved && acting) {
        setDirectorEmail("");
        setAutoResolved({ from: acting, to: "" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [acting, initialDirector]);

  const load = useCallback(async (dir: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (dir) params.set("director_email", dir);
      const res = await getJson<{ rows: DashboardRow[] }>(
        `/api/risk-tracker${params.toString() ? `?${params.toString()}` : ""}`,
      );
      setAllRows(res.rows ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load director dashboard");
      setAllRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(directorEmail);
  }, [load, directorEmail]);

  const onChangeDirector = useCallback(
    (next: string) => {
      setDirectorEmail(next);
      const sp = new URLSearchParams(searchParams);
      if (next) sp.set("director_email", next);
      else sp.delete("director_email");
      setSearchParams(sp, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  // Group every opportunity by manager_email so each card is one direct
  // report. Managers with no director_email match still show under "(no
  // manager)" — that surfaces hygiene gaps in the org chart itself.
  const byManager = useMemo(() => {
    const map = new Map<string, DashboardRow[]>();
    for (const r of allRows) {
      const key = (r.manager_email ?? "").toLowerCase() || "(no manager)";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return Array.from(map.entries())
      .map(([key, rows]) => ({ key, rows }))
      .sort((a, b) => {
        // Order managers by escalation count desc, then ACV desc — what a
        // director triages first.
        const ea = a.rows.filter((r) => r.escalation_recommended).length;
        const eb = b.rows.filter((r) => r.escalation_recommended).length;
        if (ea !== eb) return eb - ea;
        const acvA = a.rows.reduce((s, r) => s + (r.acv ?? 0), 0);
        const acvB = b.rows.reduce((s, r) => s + (r.acv ?? 0), 0);
        return acvB - acvA;
      });
  }, [allRows]);

  const orgCounts = useMemo(() => summarizeRyg(allRows), [allRows]);

  const escalations = useMemo(
    () =>
      [...allRows]
        .filter((r) => r.escalation_recommended)
        .sort((a, b) => (b.acv ?? 0) - (a.acv ?? 0)),
    [allRows],
  );

  const top10 = useMemo(
    () => [...allRows].sort((a, b) => (b.acv ?? 0) - (a.acv ?? 0)).slice(0, 10),
    [allRows],
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            SA Director Dashboard
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
            Your managers at a glance
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            One card per SA Manager you cover, with a RYG distribution, escalation count,
            and the deals they would walk you through first. This is a rollup-of-rollups —
            click into any manager card to drop into the manager view.
          </p>
        </div>
        <div className="w-72">
          <Combobox
            label="Director"
            value={directorEmail}
            options={allDirectors}
            placeholder={
              allDirectors.length
                ? `e.g. ${allDirectors[0].value}`
                : "Type a director email"
            }
            allowClear
            clearLabel="All directors"
            onChange={onChangeDirector}
          />
        </div>
      </header>

      {error ? (
        <div className="rounded-xl border border-rose-200 dark:border-rose-500/40 bg-rose-50 dark:bg-rose-500/10 p-3 text-sm text-rose-900 dark:text-rose-200">
          {error}
        </div>
      ) : null}

      {autoResolved ? (
        <div className="rounded-xl border border-sky-200 dark:border-sky-500/40 bg-sky-50 dark:bg-sky-500/10 p-3 text-xs text-sky-900 dark:text-sky-200">
          {autoResolved.to ? (
            <>
              You're signed in as <span className="font-mono">{autoResolved.from}</span>; that
              person rolls up to director{" "}
              <span className="font-mono">{autoResolved.to}</span>. Override above to inspect a
              different org.
            </>
          ) : (
            <>
              You're signed in as <span className="font-mono">{autoResolved.from}</span> — not a
              director and no director on your spine. Showing every director's rollup. Pick one
              above to focus.
            </>
          )}
        </div>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-4">
        <Stat label="Opportunities" value={orgCounts.total} />
        <Stat label="Total ACV" value={fmtAcvHelper(orgCounts.acvSum)} />
        <Stat label="Reds" value={orgCounts.red} accent="text-rose-700 dark:text-rose-300" />
        <Stat
          label="Escalations (high)"
          value={escalations.length}
          accent="text-rose-700 dark:text-rose-300"
        />
      </section>

      <section>
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Per-manager rollup</h2>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          {byManager.length} direct report{byManager.length === 1 ? "" : "s"} on the spine.
        </p>
        {byManager.length === 0 ? (
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            No opportunities under this director. (Pick another director above, or seed more
            data.)
          </p>
        ) : (
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {byManager.map((g) => (
              <LevelRollupCard
                key={g.key}
                group={{
                  key: g.key,
                  drillRole: "manager",
                  rows: g.rows,
                }}
              />
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Cross-org escalation queue"
          subtitle="Every red-AND-(commit OR ≥$1M) across your managers. Bring these to the VP."
        >
          {escalations.length === 0 ? (
            <Empty text="No escalations — surprising, double-check rollup freshness." />
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {escalations.map((r) => (
                <li key={r.opp_id} className="flex flex-wrap items-start gap-3 py-2">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${rygPill(r.tech_status)}`}
                  >
                    {(r.tech_status ?? "—").toString().toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900 dark:text-white">
                      {r.account}
                      {r.opp_name ? ` · ${r.opp_name}` : ""}{" "}
                      <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                        {fmtAcvHelper(r.acv)}
                      </span>
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      Manager: {r.manager_email ?? "—"} · SE: {r.owner_se_email ?? "—"}
                    </p>
                    {r.tech_status_reason ? (
                      <p className="mt-1 text-xs text-rose-900 dark:text-rose-200">{r.tech_status_reason}</p>
                    ) : null}
                  </div>
                  <Link
                    to={`/risk?account=${encodeURIComponent(r.account)}`}
                    className="shrink-0 text-xs font-medium text-slate-700 dark:text-slate-200 hover:underline"
                  >
                    Risk Tracker →
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="Top 10 by ACV across your org"
          subtitle="The deals leadership tracks regardless of forecast category."
        >
          {top10.length === 0 ? (
            <Empty text="No opportunities loaded." />
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {top10.map((r) => (
                <li key={r.opp_id} className="flex items-start gap-2 py-2">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${rygPill(r.tech_status)}`}
                  >
                    {(r.tech_status ?? "—").toString().toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900 dark:text-white">
                      {r.account}
                      {r.opp_name ? ` · ${r.opp_name}` : ""}{" "}
                      <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                        {fmtAcvHelper(r.acv)}
                      </span>
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      Manager: {r.manager_email ?? "—"} · {r.forecast_category ?? "—"} ·{" "}
                      {r.close_quarter ?? "—"}
                    </p>
                    {r.path_to_tech_win ? (
                      <p className="mt-0.5 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
                        Path: {r.path_to_tech_win}
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {loading ? <p className="text-xs text-slate-500 dark:text-slate-400">Loading latest rollups…</p> : null}
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 p-3 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-semibold ${accent ?? "text-slate-900 dark:text-white"}`}>{value}</p>
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
    <section className="rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 p-4 shadow-sm">
      <header className="mb-2">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p> : null}
      </header>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-2 text-xs text-slate-500 dark:text-slate-400">{text}</p>;
}
