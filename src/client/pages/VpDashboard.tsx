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
  close_quarter: string | null;
  what_changed: string | null;
  help_needed: string | null;
  escalation_severity: string | null;
}

interface OpportunityLite {
  vp_email?: string | null;
  director_email?: string | null;
  manager_email?: string | null;
  owner_se_email?: string | null;
}

async function autoResolveVp(actingEmail: string): Promise<string> {
  if (!actingEmail) return "";
  try {
    const res = await getJson<{ opportunities: OpportunityLite[] }>(
      "/api/opportunities?size=500",
    );
    const opps = res.opportunities ?? [];
    const lower = actingEmail.toLowerCase();
    const isVp = opps.some((o) => (o.vp_email ?? "").toLowerCase() === lower);
    if (isVp) return actingEmail;
    // The VP page only auto-resolves if the user IS the VP — managers /
    // directors can pick from the dropdown, but we don't auto-promote them.
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

export default function VpDashboard() {
  const acting = getSessionUserEmail() ?? "";
  const [searchParams, setSearchParams] = useSearchParams();
  const initialVp = (searchParams.get("vp_email") ?? "").trim();
  const [vpEmail, setVpEmail] = useState<string>(initialVp || acting);
  const [autoResolved, setAutoResolved] = useState<{ from: string; to: string } | null>(null);
  const [allRows, setAllRows] = useState<DashboardRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allVps, setAllVps] = useState<ComboboxOption[]>([]);

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
          const email = (o.vp_email ?? "").toLowerCase().trim();
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
        setAllVps(opts);
      } catch {
        // non-fatal
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (initialVp) return;
    let cancelled = false;
    void (async () => {
      const resolved = await autoResolveVp(acting);
      if (cancelled) return;
      if (resolved && resolved.toLowerCase() !== acting.toLowerCase()) {
        setVpEmail(resolved);
        setAutoResolved({ from: acting, to: resolved });
      } else if (!resolved && acting) {
        setVpEmail("");
        setAutoResolved({ from: acting, to: "" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [acting, initialVp]);

  const load = useCallback(async (vp: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (vp) params.set("vp_email", vp);
      const res = await getJson<{ rows: DashboardRow[] }>(
        `/api/risk-tracker${params.toString() ? `?${params.toString()}` : ""}`,
      );
      setAllRows(res.rows ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load VP dashboard");
      setAllRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(vpEmail);
  }, [load, vpEmail]);

  const onChangeVp = useCallback(
    (next: string) => {
      setVpEmail(next);
      const sp = new URLSearchParams(searchParams);
      if (next) sp.set("vp_email", next);
      else sp.delete("vp_email");
      setSearchParams(sp, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  // VP rolls up by director.
  const byDirector = useMemo(() => {
    const map = new Map<string, DashboardRow[]>();
    for (const r of allRows) {
      const key = (r.director_email ?? "").toLowerCase() || "(no director)";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return Array.from(map.entries())
      .map(([key, rows]) => ({ key, rows }))
      .sort((a, b) => {
        const ea = a.rows.filter((r) => r.escalation_recommended).length;
        const eb = b.rows.filter((r) => r.escalation_recommended).length;
        if (ea !== eb) return eb - ea;
        const acvA = a.rows.reduce((s, r) => s + (r.acv ?? 0), 0);
        const acvB = b.rows.reduce((s, r) => s + (r.acv ?? 0), 0);
        return acvB - acvA;
      });
  }, [allRows]);

  const orgCounts = useMemo(() => summarizeRyg(allRows), [allRows]);

  // Top 10 by ACV — Kevin's first question, every Friday.
  const top10 = useMemo(
    () => [...allRows].sort((a, b) => (b.acv ?? 0) - (a.acv ?? 0)).slice(0, 10),
    [allRows],
  );

  // Asks of leadership — anything with a non-empty help_needed value, sorted
  // so escalations float to the top. This is the differentiator vs. the
  // director view: a VP gets specific asks they can act on.
  const asks = useMemo(
    () =>
      allRows
        .filter((r) => (r.help_needed ?? "").trim().length > 0)
        .sort((a, b) => {
          if (a.escalation_recommended !== b.escalation_recommended) {
            return a.escalation_recommended ? -1 : 1;
          }
          return (b.acv ?? 0) - (a.acv ?? 0);
        }),
    [allRows],
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            SA VP Dashboard
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
            Pre-sales org at a glance
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            One card per director, top-10 deals by ACV with Path to Tech Win, and a
            consolidated asks-of-leadership list. Designed for the Kevin-level weekly review.
          </p>
        </div>
        <div className="w-72">
          <Combobox
            label="VP"
            value={vpEmail}
            options={allVps}
            placeholder={
              allVps.length ? `e.g. ${allVps[0].value}` : "Type a VP email"
            }
            allowClear
            clearLabel="All VPs"
            onChange={onChangeVp}
          />
        </div>
      </header>

      {error ? (
        <div className="rounded-xl border border-rose-200 dark:border-rose-500/40 bg-rose-50 dark:bg-rose-500/10 p-3 text-sm text-rose-900 dark:text-rose-200">
          {error}
        </div>
      ) : null}

      {autoResolved && !autoResolved.to ? (
        <div className="rounded-xl border border-sky-200 dark:border-sky-500/40 bg-sky-50 dark:bg-sky-500/10 p-3 text-xs text-sky-900 dark:text-sky-200">
          You're signed in as <span className="font-mono">{autoResolved.from}</span> — not a VP
          on the spine. Showing every VP's rollup. Pick one above to focus.
        </div>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-4">
        <Stat label="Opportunities" value={orgCounts.total} />
        <Stat label="Total ACV" value={fmtAcvHelper(orgCounts.acvSum)} />
        <Stat label="Reds" value={orgCounts.red} accent="text-rose-700 dark:text-rose-300" />
        <Stat label="Asks open" value={asks.length} accent="text-amber-700 dark:text-amber-300" />
      </section>

      <section>
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Per-director rollup</h2>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          {byDirector.length} director
          {byDirector.length === 1 ? "" : "s"} on the spine, ordered by escalation count.
        </p>
        {byDirector.length === 0 ? (
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">No opportunities under this VP.</p>
        ) : (
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {byDirector.map((g) => (
              <LevelRollupCard
                key={g.key}
                group={{ key: g.key, drillRole: "director", rows: g.rows }}
              />
            ))}
          </div>
        )}
      </section>

      <Panel
        title="Top 10 by ACV — Path to Tech Win"
        subtitle="The ten deals Kevin asks about every Friday. RYG and the explicit Path to Tech Win lead."
      >
        {top10.length === 0 ? (
          <Empty text="No opportunities loaded." />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {top10.map((r) => (
              <li key={r.opp_id} className="py-3">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${rygPill(r.tech_status)}`}
                  >
                    {(r.tech_status ?? "—").toString().toUpperCase()}
                  </span>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">
                    {r.account}
                    {r.opp_name ? ` · ${r.opp_name}` : ""}{" "}
                    <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                      {fmtAcvHelper(r.acv)}
                    </span>
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Director: {r.director_email ?? "—"} · Manager:{" "}
                    {r.manager_email ?? "—"} · {r.forecast_category ?? "—"}
                  </p>
                </div>
                {r.path_to_tech_win ? (
                  <p className="mt-1.5 text-xs text-slate-700 dark:text-slate-200">
                    <span className="font-semibold text-slate-800 dark:text-slate-100">Path to Tech Win:</span>{" "}
                    {r.path_to_tech_win}
                  </p>
                ) : (
                  <p className="mt-1.5 text-xs italic text-slate-500 dark:text-slate-400">
                    No Path to Tech Win on file. Ask the SE to draft one.
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        title="Asks of leadership"
        subtitle="Help-needed signals from the field. Escalations first, then ACV. These are the items only a VP can unblock."
      >
        {asks.length === 0 ? (
          <Empty text="No active asks. (Or the field hasn't filled in help_needed.)" />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {asks.map((r) => (
              <li key={r.opp_id} className="flex flex-wrap items-start gap-3 py-2">
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
                    Director: {r.director_email ?? "—"} · Manager:{" "}
                    {r.manager_email ?? "—"}
                    {r.escalation_recommended ? " · escalation" : ""}
                  </p>
                  <p className="mt-1 text-xs text-slate-800 dark:text-slate-100">{r.help_needed}</p>
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
