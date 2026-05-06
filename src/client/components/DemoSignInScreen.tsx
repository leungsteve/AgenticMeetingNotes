import { useCallback, useEffect, useState } from "react";
import { ApiError, getJson, postJson } from "../lib/api.js";
import { useSession } from "../hooks/useSession.js";

export interface DemoPersonaCard {
  email: string;
  name: string;
  title: string;
  orgGroup: string;
  focus: string;
  order: number;
}

interface OrgSection {
  id: string;
  label: string;
  personas: DemoPersonaCard[];
}

export default function DemoSignInScreen() {
  const { refreshSession } = useSession();
  const [personas, setPersonas] = useState<DemoPersonaCard[]>([]);
  const [orgSections, setOrgSections] = useState<OrgSection[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await getJson<{ personas: DemoPersonaCard[]; orgSections: OrgSection[] }>(
          "/auth/demo/config",
        );
        setPersonas(res.personas ?? []);
        setOrgSections(res.orgSections ?? []);
        const list = res.personas ?? [];
        if (list.length === 1) setEmail(list[0]!.email);
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
    <div className="min-h-screen bg-slate-100 px-4 py-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 lg:flex-row lg:items-start">
        <div className="flex-1 space-y-5 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-shell">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-700">
              Demo org chart
            </p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">Who to log in as</h2>
            <p className="mt-2 text-sm text-slate-600">
              Synthetic AMER cast aligned with <code className="rounded bg-slate-100 px-1 text-xs">data/opportunities.csv</code>{" "}
              and seeded Granola notes. Click a person to select them for sign-in. Same PIN for everyone — identity is the email.
            </p>
          </div>

          {loadErr ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
              {loadErr}
            </div>
          ) : null}

          <div className="space-y-6">
            {orgSections.map((section) => (
              <section key={section.id}>
                <h3 className="border-b border-slate-100 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {section.label}
                </h3>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {section.personas.map((p) => {
                    const selected = email === p.email;
                    return (
                      <button
                        key={p.email}
                        type="button"
                        onClick={() => setEmail(p.email)}
                        className={`rounded-xl border px-3 py-2.5 text-left text-sm transition-colors ${
                          selected
                            ? "border-blue-500 bg-blue-50/80 ring-1 ring-blue-200"
                            : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                        }`}
                      >
                        <p className="font-medium text-slate-900">{p.name}</p>
                        <p className="text-[11px] text-slate-500">{p.title}</p>
                        <p className="mt-1 text-[11px] leading-snug text-slate-600">{p.focus}</p>
                        <p className="mt-1 font-mono text-[10px] text-slate-400">{p.email}</p>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>

        <div className="w-full max-w-md shrink-0 rounded-2xl border border-slate-200/80 bg-white p-8 shadow-shell lg:sticky lg:top-8">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-700">Demo sign-in</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">Granola → Elastic</h1>
          <p className="mt-3 text-sm text-slate-600">
            Enter the shared demo PIN, then sign in. Scope (notes, risk, chat) follows the selected persona in Elastic — same as production,
            without corporate OAuth.
          </p>

          {error ? (
            <div className="mt-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900" role="alert">
              {error}
            </div>
          ) : null}

          <div className="mt-6 space-y-4">
            <div>
              <label htmlFor="demo-persona" className="block text-xs font-medium text-slate-600">
                Selected persona
              </label>
              <select
                id="demo-persona"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              >
                <option value="">Select…</option>
                {personas.map((p) => (
                  <option key={p.email} value={p.email}>
                    {p.name} — {p.title}
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
                placeholder="Shared secret from .env"
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
            Re-seed demo data with <code className="rounded bg-slate-100 px-1">npm run demo:reset && npm run demo:all</code> after changing{" "}
            <code className="rounded bg-slate-100 px-1">data/opportunities.csv</code>.
          </p>
        </div>
      </div>
    </div>
  );
}
