import { useCallback, useEffect, useState } from "react";
import { useSession } from "../hooks/useSession.js";
import { getJson, postJson } from "../lib/api.js";
import { getSessionUserEmail, setSessionUserEmail } from "../lib/session.js";
import type { LookupRow, TeamMemberRow } from "../types/index.js";

interface SystemStatus {
  elastic: { ok: boolean; endpoint_preview: string };
  drive: { path: string; configured: boolean; exists: boolean };
}

export default function Settings() {
  const { user, multiUser, scope } = useSessionWithScope();
  const isAdmin = !multiUser || (user?.isAdmin ?? false);

  const [members, setMembers] = useState<TeamMemberRow[]>([]);
  const [memberForm, setMemberForm] = useState({
    user_email: "",
    user_name: "",
    user_role: "SA",
    granola_api_key: "",
  });
  const [drivePath, setDrivePath] = useState("");
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [banner, setBanner] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [currentUser, setCurrentUser] = useState(getSessionUserEmail);
  const [updateKeyForm, setUpdateKeyForm] = useState<{ email: string; key: string } | null>(null);

  const refresh = useCallback(async () => {
    const [m, s] = await Promise.all([
      getJson<TeamMemberRow[]>("/api/team-members"),
      getJson<SystemStatus>("/api/system-status"),
    ]);
    setMembers(m);
    setStatus(s);
    setDrivePath(s.drive.path || "");
  }, []);

  useEffect(() => {
    void refresh().catch(() => setBanner({ type: "err", text: "Could not load settings." }));
  }, [refresh]);

  const flash = (type: "ok" | "err", text: string) => {
    setBanner({ type, text });
    window.setTimeout(() => setBanner(null), 5000);
  };

  const saveMember = async () => {
    try {
      await postJson("/api/team-members", memberForm);
      flash("ok", "Team member saved.");
      setMemberForm({ user_email: "", user_name: "", user_role: "SA", granola_api_key: "" });
      await refresh();
    } catch (e) {
      flash("err", e instanceof Error ? e.message : "Save failed");
    }
  };

  const updateOwnKey = async () => {
    if (!updateKeyForm) return;
    try {
      // Server enforces self-only when not admin; we still send all the
      // existing fields the row needs so we don't overwrite name/role.
      const existing = members.find((m) => m.user_email === updateKeyForm.email);
      await postJson("/api/team-members", {
        user_email: updateKeyForm.email,
        user_name: existing?.user_name ?? null,
        user_role: existing?.user_role ?? null,
        granola_api_key: updateKeyForm.key,
      });
      flash("ok", "Granola API key updated.");
      setUpdateKeyForm(null);
      await refresh();
    } catch (e) {
      flash("err", e instanceof Error ? e.message : "Update failed");
    }
  };

  const testGranola = async (email: string) => {
    try {
      await postJson("/api/team-members/test-granola", { user_email: email });
      flash("ok", "Granola API key is valid.");
    } catch (e) {
      flash("err", e instanceof Error ? e.message : "Test failed");
    }
  };

  const validateDrive = async () => {
    try {
      const r = await postJson<{ exists: boolean; resolved: string }>("/api/system-status/validate-drive", {
        path: drivePath || undefined,
      });
      flash(r.exists ? "ok" : "err", r.exists ? `Path OK: ${r.resolved}` : `Path not found: ${r.resolved}`);
    } catch (e) {
      flash("err", e instanceof Error ? e.message : "Validation failed");
    }
  };

  const addLookup = async (type: "account" | "opportunity" | "tag", value: string) => {
    const v = value.trim();
    if (!v) return;
    try {
      await postJson("/api/lookups", { type, value: v, label: v });
      flash("ok", "Lookup added.");
    } catch (e) {
      flash("err", e instanceof Error ? e.message : "Failed");
    }
  };

  // For non-admins in multi-user mode the team-members list is filtered
  // to just their own row. Admins see everyone.
  const visibleMembers = isAdmin
    ? members
    : members.filter((m) => user && m.user_email.toLowerCase() === user.email.toLowerCase());

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Settings</h2>
        <p className="mt-1 text-sm text-slate-600">
          {isAdmin
            ? "Team Granola keys, lookup values, and connection checks. Secrets stay on the server."
            : "Manage your Granola API key and review the data you have access to. Server-side admins manage everyone else."}
        </p>
      </div>

      {banner ? (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            banner.type === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-rose-200 bg-rose-50 text-rose-900"
          }`}
        >
          {banner.text}
        </div>
      ) : null}

      {multiUser ? <YourVisibilityCard email={user?.email ?? null} scope={scope} /> : null}

      {/* Legacy "current user" picker is dev-only — in multi-user mode the
          server session is the source of truth. */}
      {!multiUser ? (
        <section className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">Current user (My Notes default)</h3>
          <p className="mt-1 text-xs text-slate-500">Stored in this browser only.</p>
          <select
            className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={currentUser ?? ""}
            onChange={(e) => {
              setCurrentUser(e.target.value);
              setSessionUserEmail(e.target.value);
            }}
          >
            <option value="">Select…</option>
            {members.map((m) => (
              <option key={m.user_email} value={m.user_email}>
                {m.user_name ?? m.user_email}
              </option>
            ))}
          </select>
        </section>
      ) : null}

      {isAdmin ? (
        <section className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">Elastic connection</h3>
          <p className="mt-2 text-sm text-slate-600">
            Status:{" "}
            <span className={status?.elastic.ok ? "text-emerald-700" : "text-rose-700"}>
              {status?.elastic.ok ? "Connected" : "Not connected"}
            </span>
          </p>
          <p className="mt-1 break-all text-xs text-slate-500">
            Endpoint preview: {status?.elastic.endpoint_preview || "—"}
          </p>
          <p className="mt-2 text-xs text-slate-400">
            Cloud ID / URL and API key are read from server <code className="rounded bg-slate-100 px-1">.env</code>{" "}
            only.
          </p>
        </section>
      ) : null}

      {isAdmin ? (
        <section className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">Drive folder (server path)</h3>
          <p className="mt-1 text-xs text-slate-500">
            Configure <code className="rounded bg-slate-100 px-1">DRIVE_NOTES_PATH</code> in server{" "}
            <code className="rounded bg-slate-100 px-1">.env</code>. Validate that the server can see the path.
          </p>
          <input
            className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={drivePath}
            onChange={(e) => setDrivePath(e.target.value)}
            placeholder="Path on the machine running the API"
          />
          <p className="mt-1 text-xs text-slate-500">
            Configured path exists:{" "}
            <span className={status?.drive.exists ? "text-emerald-700" : "text-rose-700"}>
              {status ? (status.drive.exists ? "yes" : "no") : "—"}
            </span>
          </p>
          <button
            type="button"
            className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium shadow-sm hover:bg-slate-50"
            onClick={() => void validateDrive()}
          >
            Validate path
          </button>
        </section>
      ) : null}

      <section className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900">
          {isAdmin ? "Team members" : "Your account"}
        </h3>
        <ul className="mt-4 divide-y divide-slate-100 text-sm">
          {visibleMembers.map((m) => {
            const isSelf = user && m.user_email.toLowerCase() === user.email.toLowerCase();
            const expanded = updateKeyForm?.email === m.user_email;
            return (
              <li key={m.user_email} className="flex flex-col gap-2 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium text-slate-900">{m.user_name ?? m.user_email}</p>
                    <p className="text-xs text-slate-500">
                      {m.user_email} · {m.user_role ?? "—"} · key {m.granola_api_key_masked ?? "—"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium hover:bg-slate-50"
                      onClick={() => void testGranola(m.user_email)}
                    >
                      Test connection
                    </button>
                    {(isAdmin || isSelf) && multiUser ? (
                      <button
                        type="button"
                        className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium hover:bg-slate-50"
                        onClick={() =>
                          setUpdateKeyForm(
                            expanded ? null : { email: m.user_email, key: "" },
                          )
                        }
                      >
                        {expanded ? "Cancel" : "Update key"}
                      </button>
                    ) : null}
                  </div>
                </div>
                {expanded ? (
                  <div className="flex flex-wrap items-end gap-2 rounded-lg bg-slate-50 px-3 py-2">
                    <input
                      className="min-w-[260px] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      placeholder="New Granola API key"
                      type="password"
                      autoComplete="off"
                      value={updateKeyForm?.key ?? ""}
                      onChange={(e) =>
                        setUpdateKeyForm((f) => (f ? { ...f, key: e.target.value } : f))
                      }
                    />
                    <button
                      type="button"
                      className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                      onClick={() => void updateOwnKey()}
                      disabled={!updateKeyForm?.key.trim()}
                    >
                      Save key
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
          {!visibleMembers.length ? (
            <li className="py-3 text-slate-500">
              {isAdmin ? "No members yet." : "Your account is not registered yet — ask an admin."}
            </li>
          ) : null}
        </ul>

        {isAdmin ? (
          <>
            <p className="mt-6 text-xs font-medium uppercase tracking-wide text-slate-500">Add member</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <input
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                placeholder="Email"
                value={memberForm.user_email}
                onChange={(e) => setMemberForm((f) => ({ ...f, user_email: e.target.value }))}
              />
              <input
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                placeholder="Name"
                value={memberForm.user_name}
                onChange={(e) => setMemberForm((f) => ({ ...f, user_name: e.target.value }))}
              />
              <input
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                placeholder="Role (e.g. SA, AE)"
                value={memberForm.user_role}
                onChange={(e) => setMemberForm((f) => ({ ...f, user_role: e.target.value }))}
              />
              <input
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                placeholder="Granola API key"
                type="password"
                autoComplete="off"
                value={memberForm.granola_api_key}
                onChange={(e) => setMemberForm((f) => ({ ...f, granola_api_key: e.target.value }))}
              />
            </div>
            <button
              type="button"
              className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              onClick={() => void saveMember()}
            >
              Save member
            </button>
          </>
        ) : null}
      </section>

      {isAdmin ? (
        <>
          <LookupQuickAdd title="Accounts" type="account" onAdd={(v) => void addLookup("account", v)} />
          <LookupQuickAdd
            title="Opportunities"
            type="opportunity"
            onAdd={(v) => void addLookup("opportunity", v)}
          />
          <LookupQuickAdd title="Tags" type="tag" onAdd={(v) => void addLookup("tag", v)} />
        </>
      ) : null}
    </div>
  );
}

/** Local re-export so we can pull `scope` off the session result without
 * leaking it back into the broader hook signature. */
function useSessionWithScope() {
  const { user, multiUser } = useSession();
  return { user, multiUser, scope: user?.scope ?? null };
}

function YourVisibilityCard({
  email,
  scope,
}: {
  email: string | null;
  scope: NonNullable<ReturnType<typeof useSessionWithScope>>["scope"];
}) {
  if (!email) return null;
  const isAdmin = scope?.is_admin ?? false;
  return (
    <section className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900">Your visibility</h3>
      <p className="mt-1 text-xs text-slate-500">
        Signed in as <span className="font-medium text-slate-700">{email}</span>.
      </p>
      {isAdmin ? (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          You are an <span className="font-semibold">admin</span> — you can see every account,
          opportunity, and note.
        </p>
      ) : (
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Stat
            label="Accounts you can see"
            value={String(scope?.visible_accounts_count ?? "—")}
            help="Pursuit team membership + manager chain"
          />
          <Stat
            label="Opportunities"
            value={String(scope?.visible_opp_ids_count ?? "—")}
            help="Where you appear in the reporting chain"
          />
          <Stat
            label="Pursuit team accounts"
            value={String(scope?.pursuit_accounts_count ?? "—")}
            help="Where you are explicitly named"
          />
        </div>
      )}
      {!isAdmin && scope?.pursuit_accounts.length ? (
        <div className="mt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Your pursuit-team accounts
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5 text-xs">
            {scope.pursuit_accounts.map((a) => (
              <li key={a} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-slate-700">
                {a}
              </li>
            ))}
          </ul>
          {scope.pursuit_accounts_truncated ? (
            <p className="mt-2 text-[11px] text-slate-500">
              Showing first {scope.pursuit_accounts.length} of {scope.pursuit_accounts_count}.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function Stat({ label, value, help }: { label: string; value: string; help?: string }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-900">{value}</p>
      {help ? <p className="mt-1 text-[11px] text-slate-500">{help}</p> : null}
    </div>
  );
}

function LookupQuickAdd({
  title,
  type,
  onAdd,
}: {
  title: string;
  type: "account" | "opportunity" | "tag";
  onAdd: (v: string) => void;
}) {
  const [rows, setRows] = useState<LookupRow[]>([]);
  const [val, setVal] = useState("");
  useEffect(() => {
    void getJson<LookupRow[]>(`/api/lookups?type=${type}`).then(setRows);
  }, [type]);
  return (
    <section className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <ul className="mt-2 flex max-h-32 flex-wrap gap-1 text-xs text-slate-600">
        {rows.map((r) => (
          <li key={r.value} className="rounded-full bg-slate-100 px-2 py-0.5">
            {r.label}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex gap-2">
        <input
          className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
          placeholder={`New ${type}`}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              onAdd(val);
              setVal("");
              void getJson<LookupRow[]>(`/api/lookups?type=${type}`).then(setRows);
            }
          }}
        />
        <button
          type="button"
          className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white"
          onClick={() => {
            onAdd(val);
            setVal("");
            void getJson<LookupRow[]>(`/api/lookups?type=${type}`).then(setRows);
          }}
        >
          Add
        </button>
      </div>
    </section>
  );
}
