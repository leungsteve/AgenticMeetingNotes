import type { NoteDetailResponse } from "../types/index.js";

export default function NotePreview({
  detail,
  elasticBanner,
}: {
  detail: NoteDetailResponse | null;
  elasticBanner?: { ingested_at?: string; ingested_by?: string; version?: number } | null;
}) {
  if (!detail) {
    return (
      <div className="flex h-full min-h-[240px] items-center justify-center rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-white/60 p-8 text-center text-sm text-slate-500 dark:text-slate-400">
        Select a note to preview
      </div>
    );
  }

  const summary = detail.summary_markdown || detail.summary_text || "";

  return (
    <div className="flex max-h-[calc(100vh-8rem)] flex-col gap-4 overflow-y-auto rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 p-5 shadow-sm">
      {elasticBanner?.ingested_at ? (
        <div className="rounded-lg border border-emerald-200 dark:border-emerald-500/40 bg-emerald-50/80 px-3 py-2 text-xs text-emerald-950 dark:text-emerald-200">
          Ingested on{" "}
          <time dateTime={elasticBanner.ingested_at}>
            {new Date(elasticBanner.ingested_at).toLocaleString()}
          </time>
          {elasticBanner.ingested_by ? ` by ${elasticBanner.ingested_by}` : ""}
          {elasticBanner.version != null ? ` (version ${elasticBanner.version})` : ""}
        </div>
      ) : null}

      <div>
        <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
          {detail.title || "Untitled"}
        </h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {new Date(detail.created_at).toLocaleString()} · {detail.owner.email}
        </p>
      </div>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Summary</h3>
        <div className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-200">
          {summary || "—"}
        </div>
      </section>

      <details className="rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 p-3">
        <summary className="cursor-pointer text-sm font-medium text-slate-700 dark:text-slate-200">Transcript</summary>
        <div className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-slate-600 dark:text-slate-300">
          {detail.transcript || "No transcript loaded."}
        </div>
      </details>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Attendees</h3>
        <ul className="mt-2 space-y-1 text-sm text-slate-700 dark:text-slate-200">
          {detail.attendees?.length ? (
            detail.attendees.map((a) => (
              <li key={a.email}>
                {a.name || "—"} · <span className="text-slate-500 dark:text-slate-400">{a.email}</span>
              </li>
            ))
          ) : (
            <li className="text-slate-500 dark:text-slate-400">—</li>
          )}
        </ul>
      </section>
    </div>
  );
}
