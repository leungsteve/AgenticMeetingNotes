import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ApiError, getJson, postJson } from "../lib/api.js";
import { clearSessionUserEmail, setSessionUserEmail } from "../lib/session.js";

export interface SessionScopeSummary {
  is_admin: boolean;
  pursuit_accounts: string[];
  pursuit_accounts_count: number;
  pursuit_accounts_truncated: boolean;
  visible_accounts_count: number | null;
  visible_opp_ids_count: number | null;
}

/** Mirrors `getClientAuthMode()` on the server. */
export type ClientAuthMode = "legacy" | "google" | "demo";

export interface SessionMe {
  email: string;
  name: string | null;
  picture: string | null;
  isAdmin: boolean;
  multi_user: boolean;
  auth_mode?: ClientAuthMode;
  scope?: SessionScopeSummary;
}

export type SessionStatus = "loading" | "authenticated" | "anonymous" | "error";

interface UseSessionState {
  user: SessionMe | null;
  status: SessionStatus;
  multiUser: boolean | null;
  authMode: ClientAuthMode | null;
  error: string | null;
}

const initial: UseSessionState = {
  user: null,
  status: "loading",
  multiUser: null,
  authMode: null,
  error: null,
};

interface UseSessionResult extends UseSessionState {
  loading: boolean;
  signOut: () => Promise<void>;
  signIn: () => void;
  /** Re-fetch `/api/me` after demo PIN login (or to recover from transient errors). */
  refreshSession: () => Promise<void>;
}

const SessionContext = createContext<UseSessionResult | null>(null);

/**
 * Internal session hook — bootstraps from `/api/auth-config` + `/api/me`.
 * Used once at the top of the tree (by SessionProvider).
 */
function useSessionInternal(): UseSessionResult {
  const [state, setState] = useState<UseSessionState>(initial);

  const refreshSession = useCallback(async () => {
    try {
      const me = await getJson<SessionMe>("/api/me", { suppressLoginRedirect: true });
      setSessionUserEmail(me.email);
      setState((s) => ({
        ...s,
        user: me,
        status: "authenticated",
        multiUser: me.multi_user,
        authMode: me.auth_mode ?? s.authMode,
        error: null,
      }));
    } catch (e) {
      const st = e instanceof ApiError ? e.status : 0;
      if (st === 401) {
        clearSessionUserEmail();
        setState((s) => ({
          ...s,
          user: null,
          status: "anonymous",
          error: null,
        }));
        return;
      }
      setState((s) => ({
        ...s,
        status: "error",
        error: e instanceof Error ? e.message : "Failed to load session",
      }));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const cfg = await getJson<{ multi_user: boolean; auth_mode: ClientAuthMode }>("/api/auth-config");
        if (cancelled) return;
        const authMode = cfg.auth_mode ?? "legacy";
        if (!cfg.multi_user) {
          const me = await getJson<SessionMe>("/api/me");
          if (cancelled) return;
          setSessionUserEmail(me.email);
          setState({
            user: me,
            status: "authenticated",
            multiUser: false,
            authMode: "legacy",
            error: null,
          });
          return;
        }
        try {
          const me = await getJson<SessionMe>("/api/me", { suppressLoginRedirect: true });
          if (cancelled) return;
          setSessionUserEmail(me.email);
          setState({
            user: me,
            status: "authenticated",
            multiUser: true,
            authMode: me.auth_mode ?? authMode,
            error: null,
          });
        } catch (e) {
          if (cancelled) return;
          const st = e instanceof ApiError ? e.status : 0;
          if (st === 401) {
            setState({
              user: null,
              status: "anonymous",
              multiUser: true,
              authMode,
              error: null,
            });
            return;
          }
          setState({
            user: null,
            status: "error",
            multiUser: true,
            authMode,
            error: e instanceof Error ? e.message : "Failed to load session",
          });
        }
      } catch (e) {
        if (cancelled) return;
        setState({
          user: null,
          status: "error",
          multiUser: null,
          authMode: null,
          error: e instanceof Error ? e.message : "Failed to load auth configuration",
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
      window.location.href = "/signed-out";
    }
  }, []);

  const signIn = useCallback(() => {
    if (typeof window === "undefined") return;
    if (state.authMode === "demo") {
      window.location.href = "/";
      return;
    }
    const here = window.location.pathname + window.location.search;
    window.location.href = `/auth/google/start?returnTo=${encodeURIComponent(here)}`;
  }, [state.authMode]);

  return useMemo(
    () => ({
      ...state,
      loading: state.status === "loading",
      signOut,
      signIn,
      refreshSession,
    }),
    [state, signOut, signIn, refreshSession],
  );
}

/**
 * Top-of-tree provider. Wrap once (in App.tsx) and the session is shared
 * across consumers via `useSession()` — avoids duplicate fetches.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const value = useSessionInternal();
  return createElement(SessionContext.Provider, { value }, children);
}

/**
 * Loads the verified user from `/api/me` after `/api/auth-config`.
 * Throws if used outside `SessionProvider`.
 */
export function useSession(): UseSessionResult {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSession() must be used inside <SessionProvider>");
  }
  return ctx;
}
