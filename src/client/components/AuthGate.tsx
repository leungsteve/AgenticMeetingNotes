import type { ReactNode } from "react";
import { useSession } from "../hooks/useSession.js";
import SignInScreen from "./SignInScreen.js";

/**
 * Top-level auth gate.
 *
 * - `loading` (initial /api/me fetch): centered spinner.
 * - `anonymous` (multi-user mode, no session): the sign-in screen.
 * - `authenticated` (or single-user dev mode with synthesized dev user): renders children.
 * - `error`: a short error panel; the user can still try to sign in.
 *
 * The /signed-out route is its own page handled in App.tsx and bypasses
 * this gate so users see a clean confirmation after sign-out.
 */
export default function AuthGate({ children }: { children: ReactNode }) {
  const { status, error, signIn } = useSession();

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <Spinner />
          Loading session…
        </div>
      </div>
    );
  }

  if (status === "anonymous") {
    return <SignInScreen onSignIn={signIn} />;
  }

  if (status === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 px-6">
        <div className="w-full max-w-md rounded-2xl border border-rose-200/80 bg-white p-8 shadow-shell">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-rose-500">
            Session error
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">
            Could not load your session
          </h1>
          <p className="mt-3 text-sm text-slate-600">{error ?? "Unknown error."}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 inline-flex w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50"
          >
            Retry
          </button>
          <button
            type="button"
            onClick={signIn}
            className="mt-2 inline-flex w-full items-center justify-center rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
          >
            Sign in again
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin text-slate-500"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path
        d="M22 12a10 10 0 0 1-10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
