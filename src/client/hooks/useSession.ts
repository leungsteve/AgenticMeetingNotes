import { useCallback, useEffect, useState } from "react";
import { ApiError, getJson, postJson } from "../lib/api.js";
import { clearSessionUserEmail, setSessionUserEmail } from "../lib/session.js";

export interface SessionMe {
  email: string;
  name: string | null;
  picture: string | null;
  isAdmin: boolean;
  multi_user: boolean;
}

interface UseSessionState {
  user: SessionMe | null;
  loading: boolean;
  multiUser: boolean | null;
  error: string | null;
}

const initial: UseSessionState = {
  user: null,
  loading: true,
  multiUser: null,
  error: null,
};

/**
 * Loads the verified user from /api/me on mount and keeps the local
 * `getSessionUserEmail()` cache in sync. In multi-user mode, a 401 here
 * triggers an automatic redirect via `lib/api.ts`. In single-user dev mode
 * /api/me will still return a synthesized dev user (so the hook resolves).
 */
export function useSession(): UseSessionState & { signOut: () => Promise<void>; signIn: () => void } {
  const [state, setState] = useState<UseSessionState>(initial);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const me = await getJson<SessionMe>("/api/me");
        if (cancelled) return;
        setSessionUserEmail(me.email);
        setState({ user: me, loading: false, multiUser: me.multi_user, error: null });
      } catch (e) {
        if (cancelled) return;
        // 401s in multi-user mode redirect via lib/api.ts before we get here.
        // If we reach the catch in dev mode (e.g. server down), surface the error.
        const status = e instanceof ApiError ? e.status : 0;
        setState({
          user: null,
          loading: false,
          multiUser: null,
          error: status === 401 ? "Not signed in" : e instanceof Error ? e.message : "Failed to load session",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const signOut = useCallback(async () => {
    try {
      await postJson("/auth/logout", {});
    } catch {
      /* ignore */
    }
    clearSessionUserEmail();
    if (typeof window !== "undefined") {
      window.location.href = "/";
    }
  }, []);

  const signIn = useCallback(() => {
    if (typeof window === "undefined") return;
    const here = window.location.pathname + window.location.search;
    window.location.href = `/auth/google/start?returnTo=${encodeURIComponent(here)}`;
  }, []);

  return { ...state, signOut, signIn };
}
