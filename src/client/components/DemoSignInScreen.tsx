import { useCallback, useEffect, useState } from "react";
import { ApiError, getJson, postJson } from "../lib/api.js";
import { useSession } from "../hooks/useSession.js";

export interface DemoPersona {
  email: string;
  name: string;
}

export default function DemoSignInScreen() {
  const { refreshSession } = useSession();
  const [personas, setPersonas] = useState<DemoPersona[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const { personas: p } = await getJson<{ personas: DemoPersona[] }>("/auth/demo/config");
        setPersonas(p ?? []);
        if ((p ?? []).length === 1) setEmail((p ?? [])[0]!.email);
      } catch (e) {
        setLoadErr(e instanceof Error ? e.message : "Could not load demo users");
      }
    })();
  }, []);

  const submit = useCallback(async () => {
    setError(null);
    setSubmitting(true);
    try {
      await postJson("/auth/demo/login", { email: email.trim(), pin });
      await refreshSession();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Sign-in failed";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }, [email, pin, refreshSession]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200/80 bg-white p-8 shadow-shell">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-700">
          Demo sign-in
        </p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">
          Granola → Elastic
        </h1>
        <p className="mt-3 text-sm text-slate-600">
          This deployment uses a shared demo PIN and fixed personas so you can switch users without
          corporate Google OAuth. Access is still scoped in Elastic the same way as production —
          only the proof-of-identity is simplified.
        </p>

        {loadErr ? (
          <div
            className="mt-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900"
            role="alert"
          >
            {loadErr}
          </div>
        ) : null}

        {error ? (
          <div
            className="mt-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900"
            role="alert"
          >
            {error}
          </div>
        ) : null}

        <div className="mt-6 space-y-4">
          <div>
            <label htmlFor="demo-persona" className="block text-xs font-medium text-slate-600">
              Persona
            </label>
            <select
              id="demo-persona"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            >
              <option value="">Select a demo user…</option>
              {personas.map((p) => (
                <option key={p.email} value={p.email}>
                  {p.name} ({p.email})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="demo-pin" className="block text-xs font-medium text-slate-600">
              Demo PIN
            </label>
            <input
              id="demo-pin"
              type="password"
              autoComplete="off"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder="Shared secret from the demo operator"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit();
              }}
            />
          </div>
          <button
            type="button"
            disabled={submitting || !email.trim() || !pin}
            onClick={() => void submit()}
            className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50"
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </div>

        <p className="mt-6 text-[11px] leading-relaxed text-slate-400">
          Do not use demo mode on the public internet without HTTPS, a strong PIN, and an
          allowlisted email set you control. Replace with Google OIDC or Entra ID before production.
        </p>
      </div>
    </div>
  );
}
