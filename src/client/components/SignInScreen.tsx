import { useEffect, useState } from "react";

interface SignInScreenProps {
  onSignIn: () => void;
  /** Pre-filled login error from the URL (e.g. ?login_error=hd_domain_blocked). */
  initialError?: string | null;
}

const ERROR_FRIENDLY_MESSAGES: Record<string, string> = {
  hd_domain_blocked: "Your Google account is not in an allowed Workspace domain.",
  email_not_verified: "Your Google email address is not verified.",
  no_pending_state:
    "Sign-in flow is missing its starting state — try clicking the sign-in button again.",
  multi_user_disabled: "Multi-user mode is currently disabled on the server.",
};

function friendlyMessage(message: string | undefined, code: string | null): string | null {
  if (code && ERROR_FRIENDLY_MESSAGES[code]) return ERROR_FRIENDLY_MESSAGES[code];
  return message ?? null;
}

/** Read login_error / login_error_code query params and clean the URL afterwards. */
function consumeLoginErrorFromUrl(): { message: string; code: string | null } | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const message = params.get("login_error");
  if (!message) return null;
  const code = params.get("login_error_code");
  params.delete("login_error");
  params.delete("login_error_code");
  const newSearch = params.toString();
  const newUrl =
    window.location.pathname + (newSearch ? `?${newSearch}` : "") + window.location.hash;
  window.history.replaceState({}, "", newUrl);
  return { message, code };
}

export default function SignInScreen({ onSignIn, initialError = null }: SignInScreenProps) {
  const [error, setError] = useState<string | null>(initialError);

  useEffect(() => {
    const consumed = consumeLoginErrorFromUrl();
    if (consumed) {
      setError(friendlyMessage(consumed.message, consumed.code));
    }
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200/80 bg-white p-8 shadow-shell">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Meeting intelligence
        </p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">
          Granola → Elastic
        </h1>
        <p className="mt-3 text-sm text-slate-600">
          Sign in with your work Google account to continue. Access is scoped to the accounts and
          opportunities you have visibility on.
        </p>

        {error ? (
          <div
            className="mt-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900"
            role="alert"
          >
            <p className="font-medium">Sign-in failed</p>
            <p className="mt-1 text-xs">{error}</p>
          </div>
        ) : null}

        <button
          type="button"
          onClick={onSignIn}
          className="mt-6 inline-flex w-full items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 shadow-sm transition-colors hover:bg-slate-50"
        >
          <GoogleGlyph />
          Sign in with Google
        </button>

        <p className="mt-6 text-[11px] leading-relaxed text-slate-400">
          Your session is a signed cookie scoped to this site. We never see your Google password.
          Per-user Granola API keys are encrypted at rest with AES-256-GCM.
        </p>
      </div>
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 18 18" aria-hidden>
      <path
        fill="#4285F4"
        d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}
