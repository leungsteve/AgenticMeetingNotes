import { useCallback, useEffect, useMemo, useState } from "react";
import { getJson, postJson } from "../lib/api.js";
import { getSessionUserEmail } from "../lib/session.js";
import type { AgentAlert } from "../types/index.js";

function userEmail(): string {
  try {
    return (localStorage.getItem("userEmail") || "").trim() || getSessionUserEmail() || "demo@elastic.co";
  } catch {
    return "demo@elastic.co";
  }
}

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const diff = (Date.now() - t) / 1000;
  if (diff < 45) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function formatAlertType(raw: string): string {
  return raw
    .split(/[_-]+/g)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function toAlert(r: unknown): AgentAlert {
  const o = r as Record<string, unknown>;
  return {
    _id: String(o._id ?? ""),
    alert_type: String(o.alert_type ?? ""),
    account: String(o.account ?? ""),
    owner: String(o.owner ?? ""),
    severity: o.severity === "high" || o.severity === "medium" || o.severity === "low" ? o.severity : "low",
    message: String(o.message ?? ""),
    read: Boolean(o.read),
    created_at: String(o.created_at ?? ""),
    metadata: o.metadata as Record<string, unknown> | undefined,
  };
}

type Tab = "all" | "unread" | "high";

export default function Inbox() {
  const [alerts, setAlerts] = useState<AgentAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("all");

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const owner = userEmail();
      const { alerts: raw } = await getJson<{ alerts: unknown[] }>(
        `/api/alerts?owner=${encodeURIComponent(owner)}&unread_only=false&size=200`,
      );
      setAlerts((raw ?? []).map(toAlert));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    if (tab === "unread") return alerts.filter((a) => !a.read);
    if (tab === "high") return alerts.filter((a) => a.severity === "high");
    return alerts;
  }, [alerts, tab]);

  const unreadCount = useMemo(() => alerts.filter((a) => !a.read).length, [alerts]);

  const markRead = async (id: string) => {
    try {
      await postJson(`/api/alerts/${encodeURIComponent(id)}/read`, {});
      await load();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Failed");
    }
  };

  const sevClass = (s: AgentAlert["severity"]) => {
    if (s === "high") return "bg-rose-100 text-rose-900";
    if (s === "medium") return "bg-amber-100 text-amber-950";
    return "bg-slate-200 text-slate-800";
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Inbox</h2>
        {unreadCount > 0 ? (
          <span className="rounded-full bg-rose-600 px-2.5 py-0.5 text-xs font-semibold text-white">
            {unreadCount}
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-1 rounded-lg border border-slate-200/80 bg-white p-1 shadow-sm">
        {(
          [
            ["all", "All"],
            ["unread", "Unread"],
            ["high", "High priority"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              tab === k ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {err ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{err}</div>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-slate-600" />
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 py-16 text-slate-500">
          <span className="mb-2 text-3xl" aria-hidden>
            🔔
          </span>
          <p className="text-sm">No alerts</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {visible.map((a) => {
            const unread = !a.read;
            return (
              <li
                key={a._id}
                className={`rounded-xl border p-4 shadow-sm ${
                  unread ? "border-slate-200 bg-white" : "border-slate-200/80 bg-slate-50/80"
                } ${unread ? "ring-1 ring-slate-200/50" : ""}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium ${sevClass(a.severity)}`}>
                      {a.severity}
                    </span>
                    <p className="mt-1 text-sm font-medium text-slate-900">{formatAlertType(a.alert_type)}</p>
                    <p className="text-xs text-slate-500">{a.account}</p>
                    <p className="mt-2 text-sm text-slate-800">{a.message}</p>
                    <p className="mt-1 text-xs text-slate-400">{timeAgo(a.created_at)}</p>
                  </div>
                  {unread ? (
                    <button
                      type="button"
                      onClick={() => void markRead(a._id)}
                      className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Mark as read
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
