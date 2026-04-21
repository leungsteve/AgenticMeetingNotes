import { useCallback, useEffect, useState } from "react";
import { ApiError, getJson } from "../lib/api.js";
import type { GranolaListRow, NoteDetailResponse } from "../types/index.js";

export function useGranolaNotesList(userEmail: string | null, createdAfter?: string) {
  const [data, setData] = useState<GranolaListRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userEmail) {
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({ user_email: userEmail });
      if (createdAfter) q.set("created_after", createdAfter);
      const rows = await getJson<GranolaListRow[]>(`/api/notes?${q.toString()}`);
      setData(rows);
    } catch (e) {
      setData(null);
      setError(e instanceof ApiError ? e.message : "Failed to load notes");
    } finally {
      setLoading(false);
    }
  }, [userEmail, createdAfter]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, error, refetch: load };
}

export async function fetchNoteDetail(
  noteId: string,
  userEmail: string,
): Promise<NoteDetailResponse> {
  const q = new URLSearchParams({ user_email: userEmail });
  return getJson<NoteDetailResponse>(`/api/notes/${encodeURIComponent(noteId)}?${q.toString()}`);
}
