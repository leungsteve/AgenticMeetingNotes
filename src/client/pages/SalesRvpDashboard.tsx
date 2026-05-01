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
  rvp_email: string | null;
  avp_email: string | null;
  close_quarter: string | null;
  what_changed: string | null;
  help_needed: string | null;
}

interface OpportunityLite {
  rvp_email?: string | null;
  owner_ae_email?: string | null;
}

async function autoResolveRvp(actingEmail: string): Promise<string> {
  if (!actingEmail) return "";
  try {
    const res = await getJson<{ opportunities: OpportunityLite[] }>(
      "/api/opportunities?size=500",
    );
    const opps = res.opportunities ?? [];
    const lower = actingEmail.toLowerCase();
    const isRvp = opps.some((o) => (o.rvp_email ?? "").toLowerCase() === lower);
    if (isRvp) return actingEmail;
    const asAe = opps.find((o) => (o.owner_ae_email ?? "").toLowerCase() === lower);
    if (asAe?.rvp_email) return asAe.rvp_email;
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

export default function SalesRvpDashboard() {
  const acting = getSessionUserEmail() ?? "";
  const [searchParams, setSearchParams] = useSearchParams();
  const initialRvp = (searchParams.get("rvp_email") ?? "").trim();
  const initialAeFilter = (searchParams.get("owner_ae_email") ?? "").trim();
  const [rvpEmail, setRvpEmail] = useState<string>(initialRvp || acting);
  const [aeEmail, setAeEmail] = useState<string>(initialAeFilter);
  const [autoResolved, setAutoResolved] = useState<{ from: string; to: string } | null>(null);
  const [allRows, setAllRows] = useState<DashboardRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allRvps, setAllRvps] = useState<ComboboxOption[]>([]);

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
          const email = (o.rvp_email ?? "").toLowerCase().trim();
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
        setAllRvps(opts);
      } catch {
        // non-fatal
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (initialRvp) return;
    let cancelled = false;
    void (async () => {
      const resolved = await autoResolveRvp(acting);
      if (cancelled) return;
      if (resolved && resolved.toLowerCase() !== acting.toLowerCase()) {
        setRvpEmail(resolved);
        setAutoResolved({ from: acting, to: resolved });
      } else if (!resolved && acting) {
        setRvpEmail("");
        setAutoResolved({ from: acting, to: "" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [acting, initialRvp]);

  const load = useCallback(async (rvp: string, ae: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (rvp) params.set("rvp_email", rvp);
      if (ae) params.set("owner_ae_email", ae);
      const res = await getJson<{ rows: DashboardRow[] }>(
        `/api/risk-tracker${params.toString() ? `?${params.toString()}` : ""}`,
      );
      setAllRows(res.rows ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load Sales RVP dashboard");
      setAllRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(rvpEmail, aeEmail);
  }, [load, rvpEmail, aeEmail]);

  const onChangeRvp = useCallback(
    (next: string) => {
      setRvpEmail(next);
      const sp = new URLSearchParams(searchParams);
      if (next) sp.set("rvp_email", next);
      else sp.delete("rvp_email");
      setSearchParams(sp, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const onChangeAe = useCallback(
    (next: string) => {
      setAeEmail(next);
      const sp = new URLSearchParams(searchParams);
      if (next) sp.set("owner_ae_email", next);
      else sp.delete("owner_ae_email");
      setSearchParams(sp, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  // RVP rolls up by AE (the sales-side direct report).
  const byAe = useMemo(() => {
    const map = new Map<string, DashboardRow[]>();
    for (const r of allRows) {
      const key = (r.owner_ae_email ?? "").toLowerCase() || "(no AE)";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return Array.from(map.entries())
      .map(([key, rows]) => ({ key, rows }))
      .sort((a, b) => {
        // Order AEs by total ACV desc — sales leadership cares about revenue
        // first, then risk (the SA side flips that ordering).
        const acvA = a.rows.reduce((s, r) => s + (r.acv ?? 0), 0);
        const acvB = b.rows.reduce((s, r) => s + (r.acv ?? 0), 0);
        if (acvA !== acvB) return acvB - acvA;
        const ea = a.rows.filter((r) => r.escalation_recommended).length;
        const eb = b.rows.filter((r) => r.escalation_recommended).length;
        return eb - ea;
      });
  }, [allRows]);

  // Forecast distribution — what an RVP scans first (commit vs upside vs
  // pipeline). Different framing from the SA side which leads with RYG.
  const forecastBuckets = useMemo(() => {
    const out = { commit: 0, upside: 0, pipeline: 0, omitted: 0, other: 0 };
    let commitAcv = 0;
    let upsideAcv = 0;
    for (const r of allRows) {
      const f = (r.forecast_category ?? "").toLowerCase();
      if (f === "commit") {
        out.commit++;
        commitAcv += r.acv ?? 0;
      } else if (f === "upside") {
        out.upside++;
        upsideAcv += r.acv ?? 0;
      } else if (f === "pipeline") out.pipeline++;
      else if (f === "omitted") out.omitted++;
      else out.other++;
    }
    return { ...out, commitAcv, upsideAcv };
  }, [allRows]);

  const orgCounts = useMemo(() => summarizeRyg(allRows), [allRows]);

  // Tech risk on commits is the sales-side equivalent of "escalations" — the
  // commit deals where the SA org is flagging red. RVPs need to know these
  // because they own the forecast call.
  const commitsAtRisk = useMemo(
    () =>
      allRows
        .filter(
          (r) =>
            (r.forecast_category ?? "").toLowerCase() === "commit" &&
            (r.tech_status ?? "").toLowerCase() === "red",
        )
        .sort((a, b) => (b.acv ?? 0) - (a.acv ?? 0)),
    [allRows],
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Sales RVP Dashboard
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
            Your AEs at a glance
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            One card per AE you cover. Forecast distribution at the top, commits with red
            tech-status flagged for the forecast call, and a drill-in to any AE.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div className="w-64">
            <Combobox
              label="RVP"
              value={rvpEmail}
              options={allRvps}
              placeholder={
                allRvps.length ? `e.g. ${allRvps[0].value}` : "Type an RVP email"
              }
              allowClear
              clearLabel="All RVPs"
              onChange={onChangeRvp}
            />
          </div>
          <div className="w-64">
            <Combobox
              label="AE (optional drill-in)"
              value={aeEmail}
              options={[]}
              placeholder="ae.email@elastic.co"
              allowClear
              clearLabel="All AEs"
              onChange={onChangeAe}
            />
          </div>
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
              person rolls up to RVP <span className="font-mono">{autoResolved.to}</span>.
              Override above to inspect a different region.
            </>
          ) : (
            <>
              You're signed in as <span className="font-mono">{autoResolved.from}</span> — not
              an RVP and no RVP on your spine. Showing every RVP's rollup. Pick one above to
              focus.
            </>
          )}
        </div>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-4">
        <Stat label="Opportunities" value={orgCounts.total} />
        <Stat
          label="Commit ACV"
          value={fmtAcvHelper(forecastBuckets.commitAcv)}
          accent="text-emerald-700 dark:text-emerald-300"
        />
        <Stat
          label="Upside ACV"
          value={fmtAcvHelper(forecastBuckets.upsideAcv)}
          accent="text-amber-700 dark:text-amber-300"
        />
        <Stat
          label="Commits at risk"
          value={commitsAtRisk.length}
          accent="text-rose-700 dark:text-rose-300"
        />
      </section>

      <Panel
        title="Forecast distribution"
        subtitle="The view a sales leader runs the forecast call against."
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <BucketStat
            label="Commit"
            count={forecastBuckets.commit}
            color="bg-emerald-500"
          />
          <BucketStat
            label="Upside"
            count={forecastBuckets.upside}
            color="bg-amber-400"
          />
          <BucketStat
            label="Pipeline"
            count={forecastBuckets.pipeline}
            color="bg-sky-400"
          />
          <BucketStat
            label="Omitted/Other"
            count={forecastBuckets.omitted + forecastBuckets.other}
            color="bg-slate-300"
          />
        </div>
      </Panel>

      <section>
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Per-AE rollup</h2>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          {byAe.length} AE{byAe.length === 1 ? "" : "s"} on the spine, ordered by total ACV.
        </p>
        {byAe.length === 0 ? (
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">No opportunities under this RVP.</p>
        ) : (
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {byAe.map((g) => (
              <LevelRollupCard
                key={g.key}
                group={{ key: g.key, drillRole: "ae", rows: g.rows }}
              />
            ))}
          </div>
        )}
      </section>

      <Panel
        title="Commits with tech red"
        subtitle="The deals you have to call out on the forecast call. Get the SA Manager involved before the meeting."
      >
        {commitsAtRisk.length === 0 ? (
          <Empty text="No commits at red tech-status. Forecast looks technically clean." />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {commitsAtRisk.map((r) => (
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
                    AE: {r.owner_ae_email ?? "—"} · SE: {r.owner_se_email ?? "—"} · close{" "}
                    {r.close_quarter ?? "—"}
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

function BucketStat({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: string;
}) {
  return (
    <div className="rounded-lg bg-slate-50 dark:bg-slate-800/40 px-3 py-2">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${color}`} />
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {label}
        </p>
      </div>
      <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-white">{count}</p>
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
