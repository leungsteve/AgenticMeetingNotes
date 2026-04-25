import { useCallback, useEffect, useMemo, useState } from "react";
import { getJson, postJson } from "../lib/api.js";

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
  if (s === "red") return { label: "Red", cls: "bg-rose-100 text-rose-900 ring-rose-200" };
  if (s === "yellow")
    return { label: "Yellow", cls: "bg-amber-100 text-amber-950 ring-amber-200" };
  if (s === "green")
    return { label: "Green", cls: "bg-emerald-100 text-emerald-900 ring-emerald-200" };
  return { label: "—", cls: "bg-slate-100 text-slate-500 ring-slate-200" };
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
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Risk Tracker
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
          Pipeline risk by opportunity
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Mirrors the columns in Kevin's Risk Tracker spreadsheet, computed from the latest meeting
          notes per opportunity. Use "Re-generate from notes" to refresh a row, or export the full
          set as CSV to paste into the leadership review.
        </p>
      </header>

      <section className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <FilterSelect
            label="SE"
            value={filters.owner_se_email}
            options={seOptions}
            onChange={(v) => setFilters({ ...filters, owner_se_email: v })}
          />
          <FilterSelect
            label="Manager"
            value={filters.manager_email}
            options={managerOptions}
            onChange={(v) => setFilters({ ...filters, manager_email: v })}
          />
          <FilterSelect
            label="Forecast"
            value={filters.forecast_category}
            options={["commit", "upside", "pipeline", "omitted"]}
            onChange={(v) => setFilters({ ...filters, forecast_category: v })}
          />
          <FilterSelect
            label="Tech Status"
            value={filters.tech_status}
            options={["red", "yellow", "green"]}
            onChange={(v) => setFilters({ ...filters, tech_status: v })}
          />
          <FilterSelect
            label="Tier"
            value={filters.tier}
            options={["1", "2", "3"]}
            onChange={(v) => setFilters({ ...filters, tier: v })}
          />
          <FilterSelect
            label="Account"
            value={filters.account}
            options={accountOptions}
            onChange={(v) => setFilters({ ...filters, account: v })}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setFilters(EMPTY_FILTERS)}
            className="rounded border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-600 hover:bg-slate-50"
          >
            Clear filters
          </button>
          <a
            href={exportUrl}
            className="rounded bg-slate-900 px-2.5 py-1 font-medium text-white hover:bg-slate-800"
          >
            Export CSV
          </a>
          <span className="text-slate-500">
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

      <section className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2">Account / Opportunity</th>
                <th className="px-3 py-2">ACV</th>
                <th className="px-3 py-2">Close</th>
                <th className="px-3 py-2">Forecast</th>
                <th className="px-3 py-2">SE</th>
                <th className="px-3 py-2">RYG</th>
                <th className="px-3 py-2">Path to Tech Win</th>
                <th className="px-3 py-2">Last Meeting</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-6 text-center text-sm text-slate-500">
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-6 text-center text-sm text-slate-500">
                    No opportunities match these filters. Run{" "}
                    <code className="rounded bg-slate-100 px-1">npm run seed:opportunities</code> to
                    seed from the CSV.
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
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

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="block text-xs font-medium text-slate-600">
      <span>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
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
      <tr className={row.escalation_recommended ? "bg-rose-50/40" : undefined}>
        <td className="px-3 py-2">
          <button
            type="button"
            onClick={onToggle}
            className="text-left font-medium text-slate-900 hover:underline"
          >
            {row.account}
            {row.opp_name ? ` · ${row.opp_name}` : ""}
          </button>
          <p className="text-[11px] text-slate-500">
            {row.tier ? `Tier ${row.tier}` : ""}
            {row.tier && row.sales_stage ? " · " : ""}
            {row.sales_stage ?? ""}
          </p>
        </td>
        <td className="px-3 py-2 font-mono text-xs text-slate-700">{fmtAcv(row.acv)}</td>
        <td className="px-3 py-2 text-xs text-slate-600">{row.close_quarter ?? ""}</td>
        <td className="px-3 py-2 text-xs capitalize text-slate-600">{row.forecast_category ?? ""}</td>
        <td className="px-3 py-2 text-xs text-slate-600">{row.owner_se_email ?? ""}</td>
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
        <td className="px-3 py-2 max-w-md text-xs text-slate-700">
          <p className="line-clamp-2">{row.path_to_tech_win ?? "—"}</p>
        </td>
        <td className="px-3 py-2 text-xs text-slate-600">{fmtDate(row.last_meeting_date)}</td>
        <td className="px-3 py-2 text-right text-xs">
          <button
            type="button"
            onClick={onRegenerate}
            disabled={busy}
            className="rounded border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
          >
            {busy ? "…" : "Re-generate"}
          </button>
        </td>
      </tr>
      {expanded ? (
        <tr>
          <td colSpan={9} className="bg-slate-50 px-6 py-4 text-xs text-slate-700">
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
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-0.5 whitespace-pre-wrap text-xs text-slate-700">{value || "—"}</p>
    </div>
  );
}
