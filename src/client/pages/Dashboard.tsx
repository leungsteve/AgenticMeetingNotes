import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getJson } from "../lib/api.js";

interface SyncStatus {
  total_notes_ingested: number;
  notes_this_week_estimate: number;
  team_members_active: number;
  notes_per_team_member: Record<string, number>;
  recent_ingestions: Array<{
    note_id?: string;
    title?: string;
    author_email?: string;
    author_name?: string;
    account?: string;
    ingested_at?: string;
    meeting_date?: string;
  }>;
}

export default function Dashboard() {
  const [sync, setSync] = useState<SyncStatus | null>(null);
  const [triageTotal, setTriageTotal] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [s, tri] = await Promise.all([
          getJson<SyncStatus>("/api/sync-status"),
          getJson<{ total: number }>("/api/ingested?account=unassigned&size=1&page=1"),
        ]);
        if (!cancelled) {
          setSync(s);
          setTriageTotal(tri.total);
        }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Failed to load dashboard");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">Dashboard</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Snapshot of ingestion activity and items that need triage.
        </p>
      </div>

      {err ? (
        <p className="rounded-lg border border-rose-200 dark:border-rose-500/40 bg-rose-50 dark:bg-rose-500/10 px-4 py-3 text-sm text-rose-800 dark:text-rose-200">{err}</p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Notes ingested (total)" value={sync?.total_notes_ingested ?? "—"} />
        <StatCard label="Notes this week (est.)" value={sync?.notes_this_week_estimate ?? "—"} />
        <StatCard label="Team members (keys on file)" value={sync?.team_members_active ?? "—"} />
        <StatCard label="Needs triage (unassigned)" value={triageTotal ?? "—"} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 p-5 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Recent ingestions</h3>
            <Link to="/team" className="text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900">
              Team view →
            </Link>
          </div>
          <ul className="mt-4 space-y-3">
            {(sync?.recent_ingestions ?? []).map((r, i) => (
              <li key={`${r.note_id}-${i}`} className="border-b border-slate-100 dark:border-slate-800 pb-3 last:border-0 last:pb-0">
                <p className="font-medium text-slate-900 dark:text-white line-clamp-2">{r.title || "Untitled"}</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {r.author_name || r.author_email || "—"} · {r.account || "—"} ·{" "}
                  {r.ingested_at ? new Date(r.ingested_at).toLocaleString() : "—"}
                </p>
              </li>
            ))}
            {!sync?.recent_ingestions?.length ? (
              <li className="text-sm text-slate-500 dark:text-slate-400">No recent ingestions yet.</li>
            ) : null}
          </ul>
        </section>

        <section className="rounded-xl border border-amber-200/80 bg-amber-50/60 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-amber-950 dark:text-amber-200">Needs triage</h3>
          <p className="mt-2 text-sm leading-relaxed text-amber-950/90">
            {triageTotal === null
              ? "Loading…"
              : `${triageTotal} ingested note(s) use account “unassigned”. Assign an account in My Notes and re-ingest.`}
          </p>
          <Link
            to="/notes"
            className="mt-4 inline-flex rounded-lg bg-amber-900 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-800"
          >
            Open My Notes
          </Link>
        </section>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">{value}</p>
    </div>
  );
}
