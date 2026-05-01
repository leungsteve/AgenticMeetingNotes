import { useCallback, useEffect, useState } from "react";
import { getJson } from "../lib/api.js";
import { useSystemStatus } from "../hooks/useSystemStatus.js";

type ToolFilter = "sfdc_*" | "sfdc_update_opportunity" | "sfdc_log_call" | "sfdc_create_task";

type ActionRow = Record<string, unknown> & { _id?: string };

function previewInput(input: unknown, max = 80): { short: string; full: string } {
  const full = (() => {
    try {
      return JSON.stringify(input ?? null, null, 0);
    } catch {
      return String(input);
    }
  })();
  const short = full.length > max ? `${full.slice(0, max)}…` : full;
  return { short, full };
}

function entityId(row: ActionRow): string {
  const input = (row.input ?? {}) as Record<string, unknown>;
  for (const k of [
    "opportunity_id",
    "opportunityId",
    "entity_id",
    "task_id",
    "id",
  ]) {
    const v = input[k];
    if (v != null && String(v)) return String(v);
  }
  return "—";
}

export default function OutboundSfdc() {
  const { status } = useSystemStatus();
  const sfdcMode = status?.salesforce?.mode ?? "stub";
  const [tool, setTool] = useState<ToolFilter>("sfdc_*");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rows, setRows] = useState<ActionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("tool_name", tool);
      params.set("size", "100");
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const { actions } = await getJson<{ actions: ActionRow[] }>(`/api/agent-actions?${params.toString()}`);
      setRows(actions ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [from, to, tool]);

  useEffect(() => {
    void load();
  }, [load]);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      window.alert("Copy failed");
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">Outbound to Salesforce</h2>

      <div
        className="rounded-lg border border-amber-200 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-200"
        role="status"
      >
        SALESFORCE_MODE={sfdcMode} — these entries are queued for manual Salesforce entry.
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 p-4 shadow-sm">
        <label className="text-xs text-slate-500 dark:text-slate-400">
          Tool
          <select
            className="mt-1 block rounded-lg border border-slate-200 dark:border-slate-800 px-2 py-1.5 text-sm"
            value={tool}
            onChange={(e) => setTool(e.target.value as ToolFilter)}
          >
            <option value="sfdc_*">All (sfdc_*)</option>
            <option value="sfdc_update_opportunity">sfdc_update_opportunity</option>
            <option value="sfdc_log_call">sfdc_log_call</option>
            <option value="sfdc_create_task">sfdc_create_task</option>
          </select>
        </label>
        <label className="text-xs text-slate-500 dark:text-slate-400">
          From
          <input
            type="date"
            className="mt-1 block rounded-lg border border-slate-200 dark:border-slate-800 px-2 py-1.5 text-sm"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="text-xs text-slate-500 dark:text-slate-400">
          To
          <input
            type="date"
            className="mt-1 block rounded-lg border border-slate-200 dark:border-slate-800 px-2 py-1.5 text-sm"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
        >
          Apply
        </button>
      </div>

      {err ? (
        <div className="rounded-lg border border-rose-200 dark:border-rose-500/40 bg-rose-50 dark:bg-rose-500/10 px-4 py-3 text-sm text-rose-900 dark:text-rose-200">{err}</div>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 dark:border-slate-800 border-t-slate-600" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">No SFDC actions logged yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 shadow-sm">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                <th className="p-2">Timestamp</th>
                <th className="p-2">Acting user</th>
                <th className="p-2">Tool</th>
                <th className="p-2">Entity ID</th>
                <th className="p-2">Preview</th>
                <th className="p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                const id = String(row._id ?? `idx-${idx}`);
                const ts = String(row.created_at ?? "");
                const out = row.input;
                const { short, full } = previewInput(out, 80);
                const isOpen = expanded[id];
                return (
                  <tr key={id} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="whitespace-nowrap p-2 text-slate-700 dark:text-slate-200">
                      {ts ? new Date(ts).toLocaleString() : "—"}
                    </td>
                    <td className="p-2 text-slate-800 dark:text-slate-100">{String(row.acting_user ?? "—")}</td>
                    <td className="p-2">
                      <span className="inline-block rounded bg-slate-200 dark:bg-slate-700 px-2 py-0.5 font-mono text-xs">
                        {String(row.tool_name ?? "—")}
                      </span>
                    </td>
                    <td className="p-2 font-mono text-xs text-slate-700 dark:text-slate-200">{entityId(row)}</td>
                    <td className="max-w-md p-2">
                      <button
                        type="button"
                        onClick={() => setExpanded((e) => ({ ...e, [id]: !e[id] }))}
                        className="w-full break-all text-left text-xs text-slate-600 dark:text-slate-300 hover:text-slate-900"
                        title="Click to expand"
                      >
                        {isOpen ? full : short}
                      </button>
                    </td>
                    <td className="p-2">
                      <button
                        type="button"
                        onClick={() => void copy(typeof out === "object" && out != null ? JSON.stringify(out) : String(out))}
                        className="rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 py-1 text-xs hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        Copy JSON
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
