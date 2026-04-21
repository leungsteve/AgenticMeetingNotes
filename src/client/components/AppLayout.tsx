import type { ReactNode } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useSystemStatus } from "../hooks/useSystemStatus";

const navClass =
  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900";

function NavItem({ to, children }: { to: string; children: ReactNode }) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        `${navClass} ${isActive ? "bg-slate-100 text-slate-900 shadow-shell" : ""}`
      }
    >
      {children}
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
