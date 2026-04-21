import type { IngestRowResult } from "../types/index.js";

export default function IngestProgress({ results }: { results: IngestRowResult[] | null }) {
  if (!results?.length) return null;
  return (
    <ul className="mt-3 max-h-40 space-y-2 overflow-y-auto text-sm">
      {results.map((r, i) => (
        <li
          key={i}
          className={`flex flex-col gap-0.5 rounded-lg border px-3 py-2 ${
            r.success
              ? "border-emerald-200 bg-emerald-50/80 text-emerald-950"
              : "border-rose-200 bg-rose-50/80 text-rose-950"
          }`}
        >
          <span className="font-medium">
            {r.success
              ? r.action === "created"
                ? `Ingested (v${r.version})`
                : `Updated (v${r.version})`
              : "Failed"}
          </span>
          {r.local_file_path ? (
            <span className="break-all text-xs opacity-90">{r.local_file_path}</span>
          ) : null}
          {r.error ? <span className="text-xs">{r.error}</span> : null}
        </li>
      ))}
    </ul>
  );
}
