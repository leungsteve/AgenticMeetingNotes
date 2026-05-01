import { useCallback, useEffect, useMemo, useState } from "react";
import { getJson, postJson } from "../lib/api.js";
import Combobox from "../components/Combobox.js";

const TIER_HINT =
  "Tier 1 — Strategic (ACV ≥ $1M or anchor account, weekly manager review)\n" +
  "Tier 2 — Major / Growth ($250K–$999K, in-plan year, bi-weekly review)\n" +
  "Tier 3 — Pipeline / Long-tail (< $250K or early-stage, exception only)";

type SortKey = "opp" | "acv" | "close" | "forecast" | "ryg";
type SortDir = "asc" | "desc";
const RYG_RANK: Record<string, number> = { red: 0, yellow: 1, green: 2, "": 3 };
const FORECAST_RANK: Record<string, number> = {
  commit: 0,
  upside: 1,
  pipeline: 2,
  omitted: 3,
  "": 4,
};

interface RiskTrackerRow {
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

interface Filters {
  owner_se_email: string;
  manager_email: string;
  forecast_category: string;
  tech_status: string;
  account: string;
  tier: string;
}

const EMPTY_FILTERS: Filters = {
  owner_se_email: "",
  manager_email: "",
  forecast_category: "",
  tech_status: "",
  account: "",
  tier: "",
};

function rygPill(status: string | null): { label: string; cls: string } {
  const s = (status ?? "").toLowerCase();
  if (s === "red")
    return {
      label: "Red",
      cls: "bg-rose-100 text-rose-900 ring-rose-200 dark:bg-rose-500/20 dark:text-rose-200 dark:ring-rose-500/40",
    };
  if (s === "yellow")
    return {
      label: "Yellow",
      cls: "bg-amber-100 text-amber-950 ring-amber-200 dark:bg-amber-500/20 dark:text-amber-200 dark:ring-amber-500/40",
    };
  if (s === "green")
    return {
      label: "Green",
      cls: "bg-emerald-100 text-emerald-900 ring-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-200 dark:ring-emerald-500/40",
    };
  return {
    label: "—",
    cls: "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 ring-slate-200 dark:ring-slate-700",
  };
}

function rowTone(status: string | null, escalation: boolean): string {
  const s = (status ?? "").toLowerCase();
  if (s === "red") {
    return escalation
      ? "bg-rose-100 hover:bg-rose-200 ring-1 ring-inset ring-rose-300 dark:bg-rose-500/20 dark:hover:bg-rose-500/30 dark:ring-rose-500/40"
      : "bg-rose-50 hover:bg-rose-100 dark:bg-rose-500/10 dark:hover:bg-rose-500/20";
  }
  if (s === "yellow")
    return "bg-amber-100/80 hover:bg-amber-100 dark:bg-amber-500/15 dark:hover:bg-amber-500/25";
  if (s === "green")
    return "bg-emerald-100/70 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20";
  return "hover:bg-slate-50 dark:hover:bg-slate-800";
}

function fmtAcv(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "";
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${Math.round(v / 1000)}k`;
  return `$${v}`;
}

function fmtDate(v: string | null): string {
  if (!v) return "—";
  return v.slice(0, 10);
}

function buildQuery(filters: Filters): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v) params.set(k, v);
  }
  return params.toString();
}

export default function RiskTracker() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [rows, setRows] = useState<RiskTrackerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyOppId, setBusyOppId] = useState<string | null>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("acv");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const onSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "opp" || key === "close" ? "asc" : "desc");
    }
  };

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    const dir = sortDir === "asc" ? 1 : -1;
    copy.sort((a, b) => {
      switch (sortKey) {
        case "opp": {
          const ka = `${a.account} ${a.opp_name}`.toLowerCase();
          const kb = `${b.account} ${b.opp_name}`.toLowerCase();
          return ka.localeCompare(kb) * dir;
        }
        case "acv":
          return ((a.acv ?? 0) - (b.acv ?? 0)) * dir;
        case "close": {
          const ka = a.close_quarter ?? "";
          const kb = b.close_quarter ?? "";
          return ka.localeCompare(kb) * dir;
        }
        case "forecast": {
          const ra = FORECAST_RANK[(a.forecast_category ?? "").toLowerCase()] ?? 4;
          const rb = FORECAST_RANK[(b.forecast_category ?? "").toLowerCase()] ?? 4;
          return (ra - rb) * dir;
        }
        case "ryg": {
          const ra = RYG_RANK[(a.tech_status ?? "").toLowerCase()] ?? 3;
          const rb = RYG_RANK[(b.tech_status ?? "").toLowerCase()] ?? 3;
          return (ra - rb) * dir;
        }
      }
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  const load = useCallback(async (next: Filters) => {
    setLoading(true);
    setError(null);
    try {
      const q = buildQuery(next);
      const res = await getJson<{ rows: RiskTrackerRow[]; count: number }>(
        `/api/risk-tracker${q ? `?${q}` : ""}`,
      );
      setRows(res.rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load risk tracker");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(filters);
  }, [load, filters]);

  const seOptions = useMemo(
    () => [...new Set(rows.map((r) => r.owner_se_email).filter((v): v is string => !!v))].sort(),
    [rows],
  );
  const managerOptions = useMemo(
    () => [...new Set(rows.map((r) => r.manager_email).filter((v): v is string => !!v))].sort(),
    [rows],
  );
  const accountOptions = useMemo(
    () => [...new Set(rows.map((r) => r.account))].sort(),
    [rows],
  );

  const counts = useMemo(() => {
    const out = { red: 0, yellow: 0, green: 0, none: 0, escalations: 0 };
    for (const r of rows) {
      const s = (r.tech_status ?? "").toLowerCase();
      if (s === "red") out.red++;
      else if (s === "yellow") out.yellow++;
      else if (s === "green") out.green++;
      else out.none++;
      if (r.escalation_recommended) out.escalations++;
    }
    return out;
  }, [rows]);

  const totalAcv = useMemo(
    () => rows.reduce((acc, r) => acc + (r.acv ?? 0), 0),
    [rows],
  );

  const onRegenerate = async (oppId: string) => {
    setBusyOppId(oppId);
    try {
      await postJson(`/api/risk-tracker/${encodeURIComponent(oppId)}/regenerate`, {});
      await load(filters);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Re-generate failed");
    } finally {
      setBusyOppId(null);
    }
  };

  const exportUrl = `/api/risk-tracker/export.csv${
    buildQuery(filters) ? `?${buildQuery(filters)}` : ""
  }`;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          Risk Tracker
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
          Pipeline risk by opportunity
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Mirrors the columns in Kevin's Risk Tracker spreadsheet, computed from the latest meeting
          notes per opportunity. Use "Re-generate from notes" to refresh a row, or export the full
          set as CSV to paste into the leadership review.
        </p>
      </header>

      <section className="rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Combobox
            label="SE"
            value={filters.owner_se_email}
            options={seOptions}
            placeholder="All SEs"
            allowClear
            onChange={(v) => setFilters({ ...filters, owner_se_email: v })}
          />
          <Combobox
            label="Manager"
            value={filters.manager_email}
            options={managerOptions}
            placeholder="All managers"
            allowClear
            onChange={(v) => setFilters({ ...filters, manager_email: v })}
          />
          <Combobox
            label="Forecast"
            value={filters.forecast_category}
            options={["commit", "upside", "pipeline", "omitted"]}
            placeholder="All forecast"
            allowClear
            onChange={(v) => setFilters({ ...filters, forecast_category: v })}
          />
          <Combobox
            label="Tech Status"
            value={filters.tech_status}
            options={["red", "yellow", "green"]}
            placeholder="All RYG"
            allowClear
            onChange={(v) => setFilters({ ...filters, tech_status: v })}
          />
          <div title={TIER_HINT}>
            <Combobox
              label="Tier ⓘ"
              value={filters.tier}
              options={[
                { value: "1", label: "1", hint: "Strategic ≥ $1M" },
                { value: "2", label: "2", hint: "Major / Growth $250K–$999K" },
                { value: "3", label: "3", hint: "Pipeline / Long-tail < $250K" },
              ]}
              placeholder="All tiers"
              allowClear
              onChange={(v) => setFilters({ ...filters, tier: v })}
            />
          </div>
          <Combobox
            label="Account"
            value={filters.account}
            options={accountOptions}
            placeholder="All accounts"
            allowClear
            onChange={(v) => setFilters({ ...filters, account: v })}
          />
        </div>
        <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
          Tier definitions:{" "}
          <a href="/docs/tier-definitions.md" className="underline" title={TIER_HINT}>
            T1 strategic / T2 growth / T3 pipeline
          </a>{" "}
          — hover the Tier filter for the rule of thumb.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setFilters(EMPTY_FILTERS)}
            className="rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1 font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Clear filters
          </button>
          <a
            href={exportUrl}
            className="rounded bg-slate-900 px-2.5 py-1 font-medium text-white hover:bg-slate-800"
          >
            Export CSV
          </a>
          <span className="text-slate-500 dark:text-slate-400">
            {rows.length} opps · {fmtAcv(totalAcv)} ACV · {counts.red} red · {counts.yellow} yellow ·
            {" "}
            {counts.green} green · {counts.escalations} escalations
          </span>
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
          {error}
        </div>
      ) : null}

      <section className="overflow-hidden rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/40 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <tr>
                <th className="px-3 py-2">
                  <SortHeader
                    label="Account / Opportunity"
                    active={sortKey === "opp"}
                    dir={sortDir}
                    onClick={() => onSort("opp")}
                  />
                </th>
                <th className="px-3 py-2">
                  <SortHeader
                    label="ACV"
                    active={sortKey === "acv"}
                    dir={sortDir}
                    onClick={() => onSort("acv")}
                  />
                </th>
                <th className="px-3 py-2">
                  <SortHeader
                    label="Close"
                    active={sortKey === "close"}
                    dir={sortDir}
                    onClick={() => onSort("close")}
                  />
                </th>
                <th className="px-3 py-2">
                  <SortHeader
                    label="Forecast"
                    active={sortKey === "forecast"}
                    dir={sortDir}
                    onClick={() => onSort("forecast")}
                  />
                </th>
                <th className="px-3 py-2">SE</th>
                <th className="px-3 py-2">
                  <SortHeader
                    label="RYG"
                    active={sortKey === "ryg"}
                    dir={sortDir}
                    onClick={() => onSort("ryg")}
                  />
                </th>
                <th className="px-3 py-2">Path to Tech Win</th>
                <th className="px-3 py-2">Last Meeting</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading && sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                    Loading…
                  </td>
                </tr>
              ) : sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                    No opportunities match these filters. Run{" "}
                    <code className="rounded bg-slate-100 dark:bg-slate-800 px-1">npm run seed:opportunities</code> to
                    seed from the CSV.
                  </td>
                </tr>
              ) : (
                sortedRows.map((r) => {
                  const ryg = rygPill(r.tech_status);
                  const expanded = expandedRow === r.opp_id;
                  return (
                    <RowFragment
                      key={r.opp_id}
                      row={r}
                      ryg={ryg}
                      expanded={expanded}
                      onToggle={() => setExpandedRow(expanded ? null : r.opp_id)}
                      onRegenerate={() => void onRegenerate(r.opp_id)}
                      busy={busyOppId === r.opp_id}
                    />
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function SortHeader({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1 text-left ${
        active ? "text-slate-900 dark:text-white" : "text-slate-500 dark:text-slate-400 hover:text-slate-700"
      }`}
    >
      <span>{label}</span>
      <span aria-hidden className="text-[9px] leading-none">
        {active ? (dir === "asc" ? "▲" : "▼") : "↕"}
      </span>
    </button>
  );
}

function RowFragment({
  row,
  ryg,
  expanded,
  onToggle,
  onRegenerate,
  busy,
}: {
  row: RiskTrackerRow;
  ryg: { label: string; cls: string };
  expanded: boolean;
  onToggle: () => void;
  onRegenerate: () => void;
  busy: boolean;
}) {
  return (
    <>
      <tr className={rowTone(row.tech_status, row.escalation_recommended)}>
        <td className="px-3 py-2">
          <button
            type="button"
            onClick={onToggle}
            className="text-left font-medium text-slate-900 dark:text-white hover:underline"
          >
            {row.account}
            {row.opp_name ? ` · ${row.opp_name}` : ""}
          </button>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {row.tier ? `Tier ${row.tier}` : ""}
            {row.tier && row.sales_stage ? " · " : ""}
            {row.sales_stage ?? ""}
          </p>
        </td>
        <td className="px-3 py-2 font-mono text-xs text-slate-700 dark:text-slate-200">{fmtAcv(row.acv)}</td>
        <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-300">{row.close_quarter ?? ""}</td>
        <td className="px-3 py-2 text-xs capitalize text-slate-600 dark:text-slate-300">{row.forecast_category ?? ""}</td>
        <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-300">{row.owner_se_email ?? ""}</td>
        <td className="px-3 py-2">
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${ryg.cls}`}>
            {ryg.label}
          </span>
          {row.escalation_recommended ? (
            <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-700">
              Escalate
            </p>
          ) : null}
        </td>
        <td className="px-3 py-2 max-w-md text-xs text-slate-700 dark:text-slate-200">
          <p className="line-clamp-2">{row.path_to_tech_win ?? "—"}</p>
        </td>
        <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-300">{fmtDate(row.last_meeting_date)}</td>
        <td className="px-3 py-2 text-right text-xs">
          <button
            type="button"
            onClick={onRegenerate}
            disabled={busy}
            className="rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1 font-medium text-slate-700 dark:text-slate-200 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60"
          >
            {busy ? "…" : "Re-generate"}
          </button>
        </td>
      </tr>
      {expanded ? (
        <tr>
          <td colSpan={9} className="bg-slate-50 dark:bg-slate-800/40 px-6 py-4 text-xs text-slate-700 dark:text-slate-200">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Tech Status reason" value={row.tech_status_reason} />
              <Field
                label="Next milestone"
                value={
                  row.next_milestone_description || row.next_milestone_date
                    ? `${row.next_milestone_date ? fmtDate(row.next_milestone_date) + " — " : ""}${row.next_milestone_description ?? ""}`
                    : null
                }
              />
              <Field label="What changed" value={row.what_changed} />
              <Field label="Help needed" value={row.help_needed} />
              <Field label="Path to Tech Win (full)" value={row.path_to_tech_win} />
              <Field
                label="Action items"
                value={`${row.open_action_items ?? 0} open · ${row.overdue_action_items ?? 0} overdue`}
              />
              <Field label="Manager" value={row.manager_email} />
              <Field label="AE" value={row.owner_ae_email} />
              <Field
                label="Computed at"
                value={row.computed_at ? new Date(row.computed_at).toLocaleString() : null}
              />
              <Field
                label="Blockers"
                value={row.blockers.length ? row.blockers.join(" · ") : null}
              />
              <Field
                label="Competitors"
                value={row.competitors.length ? row.competitors.join(", ") : null}
              />
              <Field label="Opportunity Id" value={row.opp_id} />
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</p>
      <p className="mt-0.5 whitespace-pre-wrap text-xs text-slate-700 dark:text-slate-200">{value || "—"}</p>
    </div>
  );
}
