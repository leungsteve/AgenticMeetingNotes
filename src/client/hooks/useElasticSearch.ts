import { useCallback, useState } from "react";
import { ApiError, getJson } from "../lib/api.js";
import type { IngestedSearchResponse } from "../types/index.js";

export type IngestedFilters = Record<string, string | undefined>;

export function useIngestedSearch() {
  const [data, setData] = useState<IngestedSearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async (filters: IngestedFilters) => {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries(filters)) {
        if (v) q.set(k, v);
      }
      const res = await getJson<IngestedSearchResponse>(`/api/ingested?${q.toString()}`);
      setData(res);
      return res;
    } catch (e) {
      setData(null);
      const msg = e instanceof ApiError ? e.message : "Search failed";
      setError(msg);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, loading, error, search };
}

export async function fetchIngestedNote(noteId: string): Promise<Record<string, unknown>> {
  return getJson(`/api/ingested/${encodeURIComponent(noteId)}`);
}
