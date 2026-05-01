import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { getJson } from "../lib/api.js";
import { getSessionUserEmail, setSessionUserEmail } from "../lib/session.js";
import { useSystemStatus } from "../hooks/useSystemStatus";
import { useTheme } from "../hooks/useTheme";
import Combobox, { type ComboboxOption } from "./Combobox.js";

const navClass =
  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white";

function resolveNavUserEmail(): string {
  try {
    return (localStorage.getItem("userEmail") || "").trim() || getSessionUserEmail() || "demo@elastic.co";
  } catch {
    return "demo@elastic.co";
  }
}

type ViewAsRole =
  | "SA"
  | "AE"
  | "SA Manager"
  | "SA Director"
  | "SA VP"
  | "Sales RVP"
  | "Sales AVP";

interface ViewAsPerson {
  email: string;
  name?: string;
  role: ViewAsRole;
}

interface OpportunityLite {
  manager_email?: string | null;
  director_email?: string | null;
  vp_email?: string | null;
  rvp_email?: string | null;
  avp_email?: string | null;
  owner_se_email?: string | null;
  owner_se_name?: string | null;
  owner_ae_email?: string | null;
  owner_ae_name?: string | null;
}

function NavItem({ to, children, endAdornment }: { to: string; children: ReactNode; endAdornment?: ReactNode }) {
  return (
      <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        `${navClass} w-full ${endAdornment ? "justify-between" : ""} ${isActive ? "bg-slate-100 text-slate-900 shadow-shell dark:bg-slate-800 dark:text-white dark:shadow-none" : ""}`
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
      className="flex items-center gap-2 rounded-full border border-slate-200/80 bg-white px-2.5 py-1 text-xs text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} title={title} aria-hidden />
      <span className="font-medium text-slate-700 dark:text-slate-200">{label}</span>
    </div>
  );
}

export default function AppLayout() {
  const { status, loading, error, refresh } = useSystemStatus();
  const { isDark, toggle: toggleTheme } = useTheme();
  const [inboxUnread, setInboxUnread] = useState(0);
  const [viewAs, setViewAs] = useState<string>(resolveNavUserEmail());
  const [people, setPeople] = useState<ViewAsPerson[]>([]);

  // Pull every distinct human (SA, AE, manager) from the opportunity spine so
  // a demo can pivot to any persona without leaving the UI.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await getJson<{ opportunities: OpportunityLite[] }>(
          "/api/opportunities?size=500",
        );
        if (cancelled) return;
        const seen = new Map<string, ViewAsPerson>();
        // First-write-wins, but we override with a higher-rank role if the
        // same email shows up at multiple levels (rare in the demo data).
        const rank: Record<ViewAsRole, number> = {
          "Sales AVP": 0,
          "SA VP": 1,
          "Sales RVP": 2,
          "SA Director": 3,
          "SA Manager": 4,
          AE: 5,
          SA: 6,
        };
        const add = (email?: string | null, name?: string | null, role?: ViewAsRole) => {
          if (!email || !role) return;
          const key = email.toLowerCase().trim();
          if (!key) return;
          const existing = seen.get(key);
          if (!existing || rank[role] < rank[existing.role]) {
            seen.set(key, { email: key, name: name?.trim() || undefined, role });
          }
        };
        for (const o of res.opportunities ?? []) {
          add(o.owner_se_email, o.owner_se_name, "SA");
          add(o.owner_ae_email, o.owner_ae_name, "AE");
          add(o.manager_email, undefined, "SA Manager");
          add(o.director_email, undefined, "SA Director");
          add(o.vp_email, undefined, "SA VP");
          add(o.rvp_email, undefined, "Sales RVP");
          add(o.avp_email, undefined, "Sales AVP");
        }
        const ordered = Array.from(seen.values()).sort((a, b) => {
          if (rank[a.role] !== rank[b.role]) return rank[a.role] - rank[b.role];
          return a.email.localeCompare(b.email);
        });
        setPeople(ordered);
      } catch {
        setPeople([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const viewAsOptions = useMemo<ComboboxOption[]>(
    () =>
      people.map((p) => ({
        value: p.email,
        label: p.name ? `${p.name} · ${p.email}` : p.email,
        hint: p.role,
      })),
    [people],
  );

  const onChangeViewAs = useCallback((next: string) => {
    setViewAs(next);
    try {
      const trimmed = next.trim();
      if (trimmed) {
        localStorage.setItem("userEmail", trimmed);
        setSessionUserEmail(trimmed);
      } else {
        localStorage.removeItem("userEmail");
        localStorage.removeItem("pipeline_user_email");
      }
    } catch {
      // ignore localStorage errors (private mode etc.)
    }
    // The cleanest way to flip every page (Inbox, Manager Dashboard, Risk
    // Tracker auto-resolve) is a hard reload — they all read the user from
    // localStorage on mount.
    window.location.reload();
  }, []);

  const refreshInboxUnread = useCallback(async () => {
    try {
      const owner = resolveNavUserEmail();
      const { alerts } = await getJson<{ alerts: unknown[] }>(
        `/api/alerts?owner=${encodeURIComponent(owner)}&unread_only=true&size=200`,
      );
      setInboxUnread((alerts ?? []).length);
    } catch {
      setInboxUnread(0);
    }
  }, []);

  useEffect(() => {
    void refreshInboxUnread();
    const id = window.setInterval(() => void refreshInboxUnread(), 60_000);
    return () => window.clearInterval(id);
  }, [refreshInboxUnread]);

  const elasticState: ConnState = loading || error ? "pending" : status?.elastic.ok ? "ok" : "bad";
  const driveState: ConnState =
    loading || error
      ? "pending"
      : status?.drive.configured && status.drive.exists
        ? "ok"
        : "bad";
  const showElasticBanner = Boolean(status && !loading && !error && !status.elastic.ok);

  return (
    <div className="flex min-h-screen bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <aside className="flex w-56 shrink-0 flex-col border-r border-slate-200/80 bg-white shadow-shell dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
        <div className="border-b border-slate-100 px-5 py-6 dark:border-slate-800">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Meeting intelligence
          </p>
          <h1 className="mt-1 text-[15px] font-semibold leading-snug tracking-tight text-slate-900 dark:text-white">
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
          <NavItem to="/director">
            <ManagerIcon />
            Director
          </NavItem>
          <NavItem to="/vp">
            <ManagerIcon />
            VP
          </NavItem>
          <NavItem to="/sales-rvp">
            <ManagerIcon />
            Sales RVP
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
        <div className="border-t border-slate-100 p-4 text-[11px] leading-relaxed text-slate-400 dark:border-slate-800 dark:text-slate-500">
          Human-in-the-loop ingest to Elastic + shared Drive.
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 border-b border-slate-200/80 bg-white/90 px-6 py-3 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/80">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Pipeline status</p>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {loading
                  ? "Checking connections…"
                  : error
                    ? "Could not read server status."
                    : status?.elastic.endpoint_preview
                      ? `Elastic · ${status.elastic.endpoint_preview}`
                      : "Elastic · configured"}
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="w-64" title="Demo persona switcher — flips Inbox, Manager Dashboard, Risk Tracker, and the Friday digest to load as this user.">
                <Combobox
                  label="View as"
                  value={viewAs}
                  options={viewAsOptions}
                  placeholder="Pick a teammate to demo"
                  onChange={onChangeViewAs}
                />
              </div>
              <button
                type="button"
                onClick={() => void refresh()}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                Refresh
              </button>
              <button
                type="button"
                onClick={toggleTheme}
                aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
                title={isDark ? "Switch to light mode" : "Switch to dark mode"}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-amber-200 dark:hover:bg-slate-700"
              >
                {isDark ? <SunIcon /> : <MoonIcon />}
              </button>
              <StatusDot state={elasticState} label="Elastic" />
              <StatusDot
                state={driveState}
                label="Drive folder"
                hint={status?.drive.path || undefined}
              />
            </div>
          </div>
        </header>

        {showElasticBanner ? (
          <div
            className="border-b border-amber-200/80 bg-amber-50 px-6 py-2.5 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-900/20 dark:text-amber-200"
            role="status"
          >
            Cannot connect to Elastic — check Settings and your server{" "}
            <code className="rounded bg-amber-100/80 px-1 py-0.5 text-xs dark:bg-amber-900/40">.env</code> credentials.
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

function SunIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path strokeLinecap="round" d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
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
