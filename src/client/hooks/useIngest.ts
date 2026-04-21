import { useState } from "react";
import { ApiError, postJson } from "../lib/api.js";
import type { IngestResponse } from "../types/index.js";

export function useIngest() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ingest(
    notes: unknown[],
    ingestedBy: string,
  ): Promise<IngestResponse> {
    setLoading(true);
    setError(null);
    try {
      return await postJson<IngestResponse>("/api/ingest", { notes, ingested_by: ingestedBy });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Ingest failed";
      setError(msg);
      throw e;
    } finally {
      setLoading(false);
    }
  }

  return { ingest, loading, error };
}
