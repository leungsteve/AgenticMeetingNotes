import { useCallback, useEffect, useState } from "react";

export interface SystemStatus {
  elastic: {
    ok: boolean;
    endpoint_preview: string;
  };
  drive: {
    path: string;
    configured: boolean;
    exists: boolean;
  };
  agent_builder?: {
    configured: boolean;
  };
  salesforce?: {
    mode: string;
  };
}

export function useSystemStatus(pollMs = 45_000): {
  status: SystemStatus | null;
  loading: boolean;
  error: boolean;
  refresh: () => void;
} {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/system-status");
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as SystemStatus;
      setStatus(data);
      setError(false);
    } catch {
      setError(true);
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), pollMs);
    return () => window.clearInterval(id);
  }, [load, pollMs]);

  return { status, loading, error, refresh: load };
}
