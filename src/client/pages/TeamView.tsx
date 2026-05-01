import { Fragment, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getJson } from "../lib/api.js";
import type { IngestedSearchResponse } from "../types/index.js";
import Combobox, { type ComboboxOption } from "../components/Combobox.js";

interface LookupRow {
  type?: string;
  value: string;
  label?: string;
}

const AUTHOR_ROLE_OPTIONS: ComboboxOption[] = [
  { value: "SA", label: "SA — Solutions Architect" },
  { value: "SA Manager", label: "SA Manager" },
  { value: "SA Director", label: "SA Director" },
  { value: "SA VP", label: "SA VP" },
  { value: "AE", label: "AE — Account Executive" },
  { value: "Sales RVP", label: "Sales RVP" },
  { value: "Sales AVP", label: "Sales AVP" },
  { value: "CA", label: "CA — Customer Architect" },
];

export default function TeamView() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState({
    account: "",
    opportunity: "",
    author: "",
    author_role: "",
    meeting_type: "",
    tags: "",
    sales_stage: "",
    from: "",
    to: "",
    q: "",
    page: "1",
    size: "25",
  });
  const [data, setData] = useState<IngestedSearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [accountOptions, setAccountOptions] = useState<ComboboxOption[]>([]);
  const [opportunityOptions, setOpportunityOptions] = useState<ComboboxOption[]>([]);

  const query = useMemo(() => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) {
      if (v) q.set(k, v);
    }
    return q.toString();
  }, [filters]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getJson<IngestedSearchResponse>(`/api/ingested?${query}`);
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [query]);

  // Source the Account / Opportunity dropdowns from the lookup index so the
  // dropdown stays in sync with seed-lookups even when no notes have been
  // ingested yet for that account.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [accounts, opps] = await Promise.all([
          getJson<LookupRow[]>("/api/lookups?type=account"),
          getJson<LookupRow[]>("/api/lookups?type=opportunity"),
        ]);
        if (cancelled) return;
        setAccountOptions(
          (accounts ?? [])
            .map((r) => ({ value: r.value, label: r.label ?? r.value }))
            .sort((a, b) => a.label.localeCompare(b.label)),
        );
        setOpportunityOptions(
          (opps ?? [])
            .map((r) => ({ value: r.value, label: r.label ?? r.value }))
            .sort((a, b) => a.label.localeCompare(b.label)),
        );
      } catch {
        // If lookups aren't seeded yet, leave the dropdowns empty — users can
        // still type free-form, which the Combobox supports.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Author suggestions are derived from whatever notes are visible right now —
  // typing still works for any value.
  const authorOptions = useMemo<ComboboxOption[]>(() => {
    const seen = new Map<string, ComboboxOption>();
    for (const r of data?.notes ?? []) {
      const email = String(r.author_email ?? "").trim();
      if (!email) continue;
      const name = String(r.author_name ?? "").trim();
      if (!seen.has(email)) {
        seen.set(email, { value: email, label: name ? `${name}` : email, hint: name ? email : undefined });
      }
    }
    return Array.from(seen.values()).sort((a, b) =>
      (a.label ?? a.value).localeCompare(b.label ?? b.value),
    );
  }, [data]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">Team View</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          All ingested notes across the team. Keyword search runs on title and summary in Elasticsearch.
        </p>
      </div>

      <div className="grid gap-3 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
        <Combobox
          label="Account"
          value={filters.account}
          options={accountOptions}
          placeholder="Any account (type or pick)"
          allowClear
          onChange={(v) => setFilters((f) => ({ ...f, account: v }))}
        />
        <Combobox
          label="Opportunity"
          value={filters.opportunity}
          options={opportunityOptions}
          placeholder="Any opportunity"
          allowClear
          onChange={(v) => setFilters((f) => ({ ...f, opportunity: v }))}
        />
        <Combobox
          label="Author"
          value={filters.author}
          options={authorOptions}
          placeholder="Author name or email"
          allowClear
          onChange={(v) => setFilters((f) => ({ ...f, author: v }))}
        />
        <Combobox
          label="Author Role"
          value={filters.author_role}
          options={AUTHOR_ROLE_OPTIONS}
          placeholder="Any role"
          allowClear
          onChange={(v) => setFilters((f) => ({ ...f, author_role: v }))}
        />
        {(
          [
            ["meeting_type", "Meeting type"],
            ["tags", "Tags"],
            ["sales_stage", "Sales stage"],
            ["from", "From (YYYY-MM-DD)"],
            ["to", "To (YYYY-MM-DD)"],
            ["q", "Keyword search"],
          ] as const
        ).map(([k, label]) => (
          <label key={k} className="block text-xs font-medium text-slate-600 dark:text-slate-300">
            <span>{label}</span>
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-sm text-slate-900 dark:text-white shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
              placeholder={label}
              value={filters[k]}
              onChange={(e) => setFilters((f) => ({ ...f, [k]: e.target.value }))}
            />
          </label>
        ))}
        <button
          type="button"
          className="self-end rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
          onClick={() => void load()}
        >
          Apply
        </button>
      </div>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <div className="overflow-hidden rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 shadow-sm">
        {loading ? (
          <p className="p-6 text-sm text-slate-500 dark:text-slate-400">Loading…</p>
        ) : (
          <table className="min-w-full divide-y divide-slate-100 dark:divide-slate-800 text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/40 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Author</th>
                <th className="px-4 py-3">Account</th>
                <th className="px-4 py-3">Version</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {(data?.notes ?? []).map((r) => {
                const id = String(r.note_id ?? r._id ?? "");
                const open = expanded === id;
                return (
                  <Fragment key={id}>
                    <tr
                      className="cursor-pointer hover:bg-slate-50/80"
                      onClick={() => setExpanded(open ? null : id)}
                    >
                      <td className="max-w-xs truncate px-4 py-3 font-medium text-slate-900 dark:text-white">
                        {String(r.title ?? "Untitled")}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300">
                        {r.meeting_date ? new Date(String(r.meeting_date)).toLocaleString() : "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        <span className="mr-2 rounded bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
                          {String(r.author_role ?? "—")}
                        </span>
                        {String(r.author_name ?? r.author_email ?? "—")}
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs text-slate-700 dark:text-slate-200">
                          {String(r.account ?? "—")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">v{String(r.version ?? 1)}</td>
                    </tr>
                    {open ? (
                      <tr key={`${id}-detail`} className="bg-slate-50/50">
                        <td colSpan={5} className="px-4 py-4 text-slate-700 dark:text-slate-200">
                          <p className="whitespace-pre-wrap text-sm">{String(r.summary ?? "")}</p>
                          <details className="mt-3">
                            <summary className="cursor-pointer text-xs font-medium text-slate-500 dark:text-slate-400">
                              Transcript
                            </summary>
                            <pre className="mt-2 max-h-48 overflow-auto text-xs text-slate-600 dark:text-slate-300">
                              {String(r.transcript ?? "—")}
                            </pre>
                          </details>
                          <button
                            type="button"
                            className="mt-4 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white"
                            onClick={(e) => {
                              e.stopPropagation();
                              const email = String(r.author_email ?? "");
                              navigate(
                                `/notes?note=${encodeURIComponent(id)}${email ? `&user_email=${encodeURIComponent(email)}` : ""}`,
                              );
                            }}
                          >
                            Edit & Re-ingest
                          </button>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
        {data ? (
          <p className="border-t border-slate-100 dark:border-slate-800 px-4 py-2 text-xs text-slate-500 dark:text-slate-400">
            Total {data.total} · page {data.page} of {Math.max(1, Math.ceil(data.total / data.size))}
          </p>
        ) : null}
      </div>
    </div>
  );
}
