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

export interface SessionMe {
  email: string;
  name: string | null;
  picture: string | null;
  isAdmin: boolean;
  multi_user: boolean;
  scope?: SessionScopeSummary;
}

export type SessionStatus = "loading" | "authenticated" | "anonymous" | "error";

interface UseSessionState {
  user: SessionMe | null;
  status: SessionStatus;
  multiUser: boolean | null;
  error: string | null;
}

const initial: UseSessionState = {
  user: null,
  status: "loading",
  multiUser: null,
  error: null,
};

interface UseSessionResult extends UseSessionState {
  loading: boolean;
  signOut: () => Promise<void>;
  signIn: () => void;
}

const SessionContext = createContext<UseSessionResult | null>(null);

/**
 * Internal session hook — actually fetches /api/me. Used once at the top
 * of the tree (by SessionProvider). Don't call this from arbitrary
 * components; use `useSession()` instead.
 */
function useSessionInternal(): UseSessionResult {
  const [state, setState] = useState<UseSessionState>(initial);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const me = await getJson<SessionMe>("/api/me", { suppressLoginRedirect: true });
        if (cancelled) return;
        setSessionUserEmail(me.email);
        setState({ user: me, status: "authenticated", multiUser: me.multi_user, error: null });
      } catch (e) {
        if (cancelled) return;
        const status = e instanceof ApiError ? e.status : 0;
        if (status === 401) {
          // Multi-user mode without a session — render the sign-in screen.
          // (lib/api.ts still attempts a redirect for non-/api/me 401s, but
          // we explicitly suppress it for /api/me so the SPA can render.)
          setState({ user: null, status: "anonymous", multiUser: true, error: null });
          return;
        }
        setState({
          user: null,
          status: "error",
          multiUser: null,
          error: e instanceof Error ? e.message : "Failed to load session",
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
    const here = window.location.pathname + window.location.search;
    window.location.href = `/auth/google/start?returnTo=${encodeURIComponent(here)}`;
  }, []);

  return useMemo(
    () => ({ ...state, loading: state.status === "loading", signOut, signIn }),
    [state, signOut, signIn],
  );
}

/**
 * Top-of-tree provider. Wrap once (in App.tsx) and the session is shared
 * across consumers via `useSession()` — avoids a second /api/me fetch.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const value = useSessionInternal();
  return createElement(SessionContext.Provider, { value }, children);
}

/**
 * Loads the verified user from /api/me. Reads from the surrounding
 * `SessionProvider`. Throws if used outside one — wrap your tree at App
 * level.
 *
 * Status is one of:
 *   - `loading`         — initial fetch in flight
 *   - `authenticated`   — `user` is populated (this includes the dev
 *                         fallback user when MULTI_USER=false)
 *   - `anonymous`       — multi-user mode and no session; the UI should
 *                         show the SignInScreen
 *   - `error`           — server-side problem (e.g. /api/me 5xx)
 */
export function useSession(): UseSessionResult {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSession() must be used inside <SessionProvider>");
  }
  return ctx;
}
