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

function isDigestAlert(a: AgentAlert): boolean {
  return a.alert_type === "friday_digest" || a.alert_type === "friday_digest_manager";
}

function digestMarkdown(a: AgentAlert): string {
  const md = a.metadata?.markdown;
  return typeof md === "string" ? md : "";
}

function digestPath(a: AgentAlert): string | null {
  const p = a.metadata?.markdown_path;
  return typeof p === "string" && p.length ? p : null;
}

function digestWeekLabel(a: AgentAlert): string {
  const w = a.metadata?.week_label;
  return typeof w === "string" ? w : "";
}

type Tab = "all" | "unread" | "high" | "digests";

export default function Inbox() {
  const [alerts, setAlerts] = useState<AgentAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("all");
  const [openDigest, setOpenDigest] = useState<AgentAlert | null>(null);

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
    if (tab === "digests") return alerts.filter(isDigestAlert);
    return alerts;
  }, [alerts, tab]);

  const unreadCount = useMemo(() => alerts.filter((a) => !a.read).length, [alerts]);
  const digestCount = useMemo(() => alerts.filter(isDigestAlert).length, [alerts]);

  const markRead = async (id: string) => {
    try {
      await postJson(`/api/alerts/${encodeURIComponent(id)}/read`, {});
      await load();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Failed");
    }
  };

  const sevClass = (s: AgentAlert["severity"]) => {
    if (s === "high") return "bg-rose-100 dark:bg-rose-500/20 text-rose-900 dark:text-rose-200";
    if (s === "medium") return "bg-amber-100 dark:bg-amber-500/20 text-amber-950 dark:text-amber-200";
    return "bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-100";
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">Inbox</h2>
        {unreadCount > 0 ? (
          <span className="rounded-full bg-rose-600 px-2.5 py-0.5 text-xs font-semibold text-white">
            {unreadCount}
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-1 rounded-lg border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 p-1 shadow-sm">
        {(
          [
            ["all", "All"],
            ["unread", "Unread"],
            ["high", "High priority"],
            ["digests", `Digests${digestCount > 0 ? ` (${digestCount})` : ""}`],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              tab === k ? "bg-slate-900 text-white" : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {err ? (
        <div className="rounded-lg border border-rose-200 dark:border-rose-500/40 bg-rose-50 dark:bg-rose-500/10 px-4 py-3 text-sm text-rose-900 dark:text-rose-200">{err}</div>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 dark:border-slate-800 border-t-slate-600" />
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 dark:border-slate-800 py-16 text-slate-500 dark:text-slate-400">
          <span className="mb-2 text-3xl" aria-hidden>
            🔔
          </span>
          <p className="text-sm">No alerts</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {visible.map((a) => {
            const unread = !a.read;
            const isDigest = isDigestAlert(a);
            return (
              <li
                key={a._id}
                className={`rounded-xl border p-4 shadow-sm ${
                  unread ? "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900" : "border-slate-200/80 dark:border-slate-800/80 bg-slate-50/80"
                } ${unread ? "ring-1 ring-slate-200/50" : ""} ${
                  isDigest ? "border-l-4 border-l-indigo-500" : ""
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium ${sevClass(a.severity)}`}>
                      {a.severity}
                    </span>
                    <p className="mt-1 text-sm font-medium text-slate-900 dark:text-white">
                      {formatAlertType(a.alert_type)}
                      {isDigest && digestWeekLabel(a) ? (
                        <span className="ml-2 text-xs font-normal text-slate-500 dark:text-slate-400">
                          · week {digestWeekLabel(a)}
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{a.account}</p>
                    <p className="mt-2 text-sm text-slate-800 dark:text-slate-100">{a.message}</p>
                    <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{timeAgo(a.created_at)}</p>
                    {isDigest && digestPath(a) ? (
                      <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                        Saved to Drive at <code>{digestPath(a)}</code>
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {isDigest ? (
                      <button
                        type="button"
                        onClick={() => setOpenDigest(a)}
                        className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
                      >
                        Open digest
                      </button>
                    ) : null}
                    {unread ? (
                      <button
                        type="button"
                        onClick={() => void markRead(a._id)}
                        className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        Mark as read
                      </button>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {openDigest ? (
        <DigestSidePanel
          alert={openDigest}
          onClose={() => setOpenDigest(null)}
          onMarkRead={async () => {
            await markRead(openDigest._id);
            setOpenDigest(null);
          }}
        />
      ) : null}
    </div>
  );
}

function DigestSidePanel({
  alert,
  onClose,
  onMarkRead,
}: {
  alert: AgentAlert;
  onClose: () => void;
  onMarkRead: () => Promise<void>;
}) {
  const md = digestMarkdown(alert);
  return (
    <div className="fixed inset-0 z-40 flex">
      <button
        type="button"
        aria-label="Close digest"
        onClick={onClose}
        className="flex-1 bg-slate-900/30"
      />
      <aside className="flex h-full w-full max-w-2xl flex-col overflow-hidden border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl">
        <header className="flex items-start justify-between gap-2 border-b border-slate-200 dark:border-slate-800 px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-600">
              {formatAlertType(alert.alert_type)}
            </p>
            <h3 className="mt-0.5 truncate text-sm font-semibold text-slate-900 dark:text-white">
              {alert.message}
            </h3>
            {digestPath(alert) ? (
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                <code>{digestPath(alert)}</code>
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {!alert.read ? (
              <button
                type="button"
                onClick={() => void onMarkRead()}
                className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Mark read
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Close
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-800/40">
          {md ? (
            <pre className="whitespace-pre-wrap px-5 py-4 font-mono text-[12px] leading-relaxed text-slate-800 dark:text-slate-100">
              {md}
            </pre>
          ) : (
            <div className="px-5 py-6 text-sm text-slate-500 dark:text-slate-400">
              No markdown body was attached to this digest. Re-run{" "}
              <code className="rounded bg-slate-100 dark:bg-slate-800 px-1">npm run run:digest</code> to regenerate.
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
