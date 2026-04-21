import { useCallback, useEffect, useState } from "react";
import { getJson, postJson } from "../lib/api.js";
import { getSessionUserEmail, setSessionUserEmail } from "../lib/session.js";
import type { LookupRow, TeamMemberRow } from "../types/index.js";

interface SystemStatus {
  elastic: { ok: boolean; endpoint_preview: string };
  drive: { path: string; configured: boolean; exists: boolean };
}

export default function Settings() {
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

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Settings</h2>
        <p className="mt-1 text-sm text-slate-600">
          Team Granola keys, lookup values, and connection checks. Secrets stay on the server.
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

      <section className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900">Team members</h3>
        <ul className="mt-4 divide-y divide-slate-100 text-sm">
          {members.map((m) => (
            <li key={m.user_email} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div>
                <p className="font-medium text-slate-900">{m.user_name ?? m.user_email}</p>
                <p className="text-xs text-slate-500">
                  {m.user_email} · {m.user_role ?? "—"} · key {m.granola_api_key_masked ?? "—"}
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium hover:bg-slate-50"
                onClick={() => void testGranola(m.user_email)}
              >
                Test connection
              </button>
            </li>
          ))}
          {!members.length ? <li className="py-3 text-slate-500">No members yet.</li> : null}
        </ul>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
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
      </section>

      <LookupQuickAdd title="Accounts" type="account" onAdd={(v) => void addLookup("account", v)} />
      <LookupQuickAdd title="Opportunities" type="opportunity" onAdd={(v) => void addLookup("opportunity", v)} />
      <LookupQuickAdd title="Tags" type="tag" onAdd={(v) => void addLookup("tag", v)} />
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
