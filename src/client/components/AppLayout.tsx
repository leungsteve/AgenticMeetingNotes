import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { getJson } from "../lib/api.js";
import { useSession } from "../hooks/useSession.js";
import { useSystemStatus } from "../hooks/useSystemStatus";
import { getSessionUserEmail } from "../lib/session.js";

const navClass =
  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900";

/** In single-user dev mode, the Settings page writes the desired "current
 * user" to localStorage so devs can switch identities without restarting
 * the server. In multi-user mode this override is ignored — the verified
 * session is the single source of truth. */
function devModeOverride(): string | null {
  try {
    return (localStorage.getItem("userEmail") || "").trim() || getSessionUserEmail() || null;
  } catch {
    return null;
  }
}

function NavItem({ to, children, endAdornment }: { to: string; children: ReactNode; endAdornment?: ReactNode }) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        `${navClass} w-full ${endAdornment ? "justify-between" : ""} ${isActive ? "bg-slate-100 text-slate-900 shadow-shell" : ""}`
      }
    >
      <span className="flex min-w-0 items-center gap-2">{children}</span>
      {endAdornment}
    </NavLink>
  );
}

type ConnState = "ok" | "bad" | "pending";

function StatusDot({ label, state, hint }: { label: string; state: ConnState; hint?: string }) {
  const dot =
    state === "ok"
      ? "bg-emerald-500 shadow-[0_0_0_1px_rgb(16_185_129/0.35)]"
      : state === "bad"
        ? "bg-rose-500 shadow-[0_0_0_1px_rgb(244_63_94/0.35)]"
        : "animate-pulse bg-slate-300 shadow-[0_0_0_1px_rgb(148_163_184/0.4)]";
  const title =
    state === "pending" ? "Checking…" : state === "ok" ? "Connected" : "Not connected";
  return (
    <div
      title={hint}
      className="flex items-center gap-2 rounded-full border border-slate-200/80 bg-white px-2.5 py-1 text-xs text-slate-600 shadow-sm"
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} title={title} aria-hidden />
      <span className="font-medium text-slate-700">{label}</span>
    </div>
  );
}

export default function AppLayout() {
  const { status, loading, error, refresh } = useSystemStatus();
  const { user, multiUser, signOut } = useSession();
  const [inboxUnread, setInboxUnread] = useState(0);

  // The alerts route ignores the `owner` query param for non-admins (it
  // always overrides to the verified caller's email). In dev mode we
  // honor a localStorage override (set via Settings) so testers can
  // simulate other identities; in multi-user mode the verified email wins.
  const ownerForAlerts = multiUser
    ? (user?.email ?? null)
    : (devModeOverride() ?? user?.email ?? null);

  const refreshInboxUnread = useCallback(async () => {
    if (!ownerForAlerts) return;
    try {
      const { alerts } = await getJson<{ alerts: unknown[] }>(
        `/api/alerts?owner=${encodeURIComponent(ownerForAlerts)}&unread_only=true&size=200`,
      );
      setInboxUnread((alerts ?? []).length);
    } catch {
      setInboxUnread(0);
    }
  }, [ownerForAlerts]);

  useEffect(() => {
    if (!ownerForAlerts) return;
    void refreshInboxUnread();
    const id = window.setInterval(() => void refreshInboxUnread(), 60_000);
    return () => window.clearInterval(id);
  }, [ownerForAlerts, refreshInboxUnread]);

  const elasticState: ConnState = loading || error ? "pending" : status?.elastic.ok ? "ok" : "bad";
  const driveState: ConnState =
    loading || error
      ? "pending"
      : status?.drive.configured && status.drive.exists
        ? "ok"
        : "bad";
  const showElasticBanner = Boolean(status && !loading && !error && !status.elastic.ok);

  return (
    <div className="flex min-h-screen bg-slate-100">
      <aside className="flex w-56 shrink-0 flex-col border-r border-slate-200/80 bg-white shadow-shell">
        <div className="border-b border-slate-100 px-5 py-6">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Meeting intelligence
          </p>
          <h1 className="mt-1 text-[15px] font-semibold leading-snug tracking-tight text-slate-900">
            Granola → Elastic
          </h1>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 p-3">
          <NavItem to="/">Dashboard</NavItem>
          <NavItem to="/notes">My Notes</NavItem>
          <NavItem to="/team">Team View</NavItem>
          <NavItem to="/accounts">
            <AccountsIcon />
            Accounts
          </NavItem>
          <NavItem to="/risk">
            <RiskIcon />
            Risk Tracker
          </NavItem>
          <NavItem to="/manager">
            <ManagerIcon />
            Manager
          </NavItem>
          <NavItem
            to="/inbox"
            endAdornment={
              inboxUnread > 0 ? (
                <span className="shrink-0 rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                  {inboxUnread > 99 ? "99+" : inboxUnread}
                </span>
              ) : null
            }
          >
            <BellIcon />
            Inbox
          </NavItem>
          <NavItem
            to="/chat"
            endAdornment={
              <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-blue-800">
                Beta
              </span>
            }
          >
            Chat
          </NavItem>
          <NavItem to="/outbound-sfdc">SFDC Outbound</NavItem>
          <NavItem to="/settings">Settings</NavItem>
        </nav>
        <div className="border-t border-slate-100 p-4 text-[11px] leading-relaxed text-slate-400">
          Human-in-the-loop ingest to Elastic + shared Drive.
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 border-b border-slate-200/80 bg-white/90 px-6 py-3 backdrop-blur-md">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-slate-500">Pipeline status</p>
              <p className="text-sm text-slate-600">
                {loading
                  ? "Checking connections…"
                  : error
                    ? "Could not read server status."
                    : status?.elastic.endpoint_preview
                      ? `Elastic · ${status.elastic.endpoint_preview}`
                      : "Elastic · configured"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void refresh()}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50"
              >
                Refresh
              </button>
              <StatusDot state={elasticState} label="Elastic" />
              <StatusDot
                state={driveState}
                label="Drive folder"
                hint={status?.drive.path || undefined}
              />
              {multiUser && user ? (
                <div className="flex items-center gap-2 rounded-full border border-slate-200/80 bg-white px-2.5 py-1 text-xs text-slate-600 shadow-sm">
                  {user.picture ? (
                    <img
                      src={user.picture}
                      alt=""
                      className="h-5 w-5 rounded-full"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold uppercase text-slate-600">
                      {(user.name ?? user.email).slice(0, 1)}
                    </span>
                  )}
                  <span className="font-medium text-slate-700" title={user.email}>
                    {user.name ?? user.email}
                  </span>
                  {user.isAdmin ? (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-800">
                      Admin
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void signOut()}
                    className="rounded text-[11px] font-medium text-slate-500 underline-offset-2 hover:text-slate-900 hover:underline"
                  >
                    Sign out
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        {showElasticBanner ? (
          <div
            className="border-b border-amber-200/80 bg-amber-50 px-6 py-2.5 text-sm text-amber-950"
            role="status"
          >
            Cannot connect to Elastic — check Settings and your server{" "}
            <code className="rounded bg-amber-100/80 px-1 py-0.5 text-xs">.env</code> credentials.
          </div>
        ) : null}

        <main className="flex-1 overflow-auto">
          <div className="mx-auto max-w-6xl px-6 py-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

function BellIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V4a2 2 0 10-4 0v1.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
      />
    </svg>
  );
}

function AccountsIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
      />
    </svg>
  );
}

function RiskIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M12 9v3m0 4h.01M5.07 19h13.86a2 2 0 001.74-3L13.74 4a2 2 0 00-3.48 0L3.34 16a2 2 0 001.73 3z"
      />
    </svg>
  );
}

function ManagerIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M3 10h4v10H3zM10 4h4v16h-4zM17 14h4v6h-4z"
      />
    </svg>
  );
}
