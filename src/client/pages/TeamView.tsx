import { Fragment, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getJson } from "../lib/api.js";
import type { IngestedSearchResponse } from "../types/index.js";

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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Team View</h2>
        <p className="mt-1 text-sm text-slate-600">
          All ingested notes across the team. Keyword search runs on title and summary in Elasticsearch.
        </p>
      </div>

      <div className="grid gap-2 rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
        {(
          [
            "account",
            "opportunity",
            "author",
            "author_role",
            "meeting_type",
            "tags",
            "sales_stage",
            "from",
            "to",
            "q",
          ] as const
        ).map((k) => (
          <input
            key={k}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            placeholder={k}
            value={filters[k]}
            onChange={(e) => setFilters((f) => ({ ...f, [k]: e.target.value }))}
          />
        ))}
        <button
          type="button"
          className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
          onClick={() => void load()}
        >
          Apply
        </button>
      </div>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm">
        {loading ? (
          <p className="p-6 text-sm text-slate-500">Loading…</p>
        ) : (
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Author</th>
                <th className="px-4 py-3">Account</th>
                <th className="px-4 py-3">Version</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(data?.notes ?? []).map((r) => {
                const id = String(r.note_id ?? r._id ?? "");
                const open = expanded === id;
                return (
                  <Fragment key={id}>
                    <tr
                      className="cursor-pointer hover:bg-slate-50/80"
                      onClick={() => setExpanded(open ? null : id)}
                    >
                      <td className="max-w-xs truncate px-4 py-3 font-medium text-slate-900">
                        {String(r.title ?? "Untitled")}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                        {r.meeting_date ? new Date(String(r.meeting_date)).toLocaleString() : "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        <span className="mr-2 rounded bg-slate-200 px-1.5 py-0.5 text-xs font-semibold text-slate-700">
                          {String(r.author_role ?? "—")}
                        </span>
                        {String(r.author_name ?? r.author_email ?? "—")}
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                          {String(r.account ?? "—")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">v{String(r.version ?? 1)}</td>
                    </tr>
                    {open ? (
                      <tr key={`${id}-detail`} className="bg-slate-50/50">
                        <td colSpan={5} className="px-4 py-4 text-slate-700">
                          <p className="whitespace-pre-wrap text-sm">{String(r.summary ?? "")}</p>
                          <details className="mt-3">
                            <summary className="cursor-pointer text-xs font-medium text-slate-500">
                              Transcript
                            </summary>
                            <pre className="mt-2 max-h-48 overflow-auto text-xs text-slate-600">
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
          <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
            Total {data.total} · page {data.page} of {Math.max(1, Math.ceil(data.total / data.size))}
          </p>
        ) : null}
      </div>
    </div>
  );
}
