import { useCallback, useEffect, useMemo, useState } from "react";
import { getJson, postJson, putJson } from "../lib/api.js";
import { getSessionUserEmail } from "../lib/session.js";
import type { AccountRollup, PursuitTeam, PursuitTeamMember } from "../types/index.js";

const ROLES: PursuitTeamMember["role"][] = [
  "SA",
  "SA Manager",
  "SA Director",
  "SA VP",
  "AE",
  "Sales RVP",
  "Sales AVP",
  "CA",
  "Other",
];

function resolveActingUser(): string {
  try {
    return (localStorage.getItem("userEmail") || "").trim() || getSessionUserEmail() || "demo@elastic.co";
  } catch {
    return "demo@elastic.co";
  }
}

function roleBadgeClass(role: string | undefined): string {
  switch (role) {
    case "SA":
      return "bg-sky-100 dark:bg-sky-500/20 text-sky-900 dark:text-sky-200 ring-sky-200 dark:ring-sky-500/40";
    case "SA Manager":
      return "bg-sky-200 dark:bg-sky-500/30 text-sky-950 dark:text-sky-100 ring-sky-300 dark:ring-sky-500/40";
    case "SA Director":
      return "bg-indigo-100 dark:bg-indigo-500/20 text-indigo-900 dark:text-indigo-200 ring-indigo-200 dark:ring-indigo-500/40";
    case "SA VP":
      return "bg-indigo-200 dark:bg-indigo-500/30 text-indigo-950 dark:text-indigo-100 ring-indigo-300 dark:ring-indigo-500/40";
    case "AE":
      return "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-900 dark:text-emerald-200 ring-emerald-200 dark:ring-emerald-500/40";
    case "Sales RVP":
      return "bg-emerald-200 text-emerald-950 dark:text-emerald-200 ring-emerald-300";
    case "Sales AVP":
      return "bg-teal-200 dark:bg-teal-500/30 text-teal-950 dark:text-teal-100 ring-teal-300 dark:ring-teal-500/40";
    case "CA":
      return "bg-amber-100 dark:bg-amber-500/20 text-amber-950 dark:text-amber-200 ring-amber-200 dark:ring-amber-500/40";
    case "Leader":
      return "bg-violet-100 dark:bg-violet-500/20 text-violet-900 dark:text-violet-200 ring-violet-200 dark:ring-violet-500/40";
    default:
      return "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 ring-slate-200 dark:ring-slate-700";
  }
}

function sentimentBadgeClass(s: string | undefined): string {
  if (!s) return "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300";
  const t = s.toLowerCase();
  if (t.includes("enthusiastic") || t.includes("positive")) return "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-900 dark:text-emerald-200";
  if (t.includes("neutral")) return "bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-100";
  if (t.includes("cautious")) return "bg-amber-100 dark:bg-amber-500/20 text-amber-950 dark:text-amber-200";
  if (t.includes("concerned") || t.includes("skeptical")) return "bg-rose-100 dark:bg-rose-500/20 text-rose-900 dark:text-rose-200";
  return "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200";
}

function toPursuitTeam(raw: unknown): PursuitTeam {
  const o = raw as Record<string, unknown>;
  return {
    account: String(o.account ?? ""),
    account_display: String(o.account_display ?? o.account ?? ""),
    members: Array.isArray(o.members) ? (o.members as PursuitTeamMember[]) : [],
    notes: o.notes != null ? String(o.notes) : undefined,
    updated_at: o.updated_at != null ? String(o.updated_at) : undefined,
    updated_by: o.updated_by != null ? String(o.updated_by) : undefined,
  };
}

function toAccountRollup(raw: unknown): AccountRollup | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  return {
    account: String(o.account ?? ""),
    meeting_count: Number(o.meeting_count ?? 0),
    last_meeting_date: o.last_meeting_date != null ? String(o.last_meeting_date) : undefined,
    first_meeting_date: o.first_meeting_date != null ? String(o.first_meeting_date) : undefined,
    open_action_items: Number(o.open_action_items ?? 0),
    overdue_action_items: Number(o.overdue_action_items ?? 0),
    competitors_seen: Array.isArray(o.competitors_seen) ? (o.competitors_seen as string[]) : [],
    sentiment_counts:
      o.sentiment_counts && typeof o.sentiment_counts === "object"
        ? (o.sentiment_counts as Record<string, number>)
        : {},
    latest_sentiment: o.latest_sentiment != null ? String(o.latest_sentiment) : undefined,
    momentum_score: o.momentum_score != null ? Number(o.momentum_score) : undefined,
    computed_at: o.computed_at != null ? String(o.computed_at) : undefined,
  };
}

export default function Accounts() {
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [teams, setTeams] = useState<PursuitTeam[]>([]);
  const [rollupByAccount, setRollupByAccount] = useState<Map<string, AccountRollup>>(() => new Map());
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detail, setDetail] = useState<PursuitTeam | null>(null);
  const [selectedRollup, setSelectedRollup] = useState<AccountRollup | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [formDisplay, setFormDisplay] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formMembers, setFormMembers] = useState<PursuitTeamMember[]>([]);
  const [newMember, setNewMember] = useState({ email: "", name: "", role: "SA" as PursuitTeamMember["role"] });
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState({ account: "", account_display: "" });

  const loadLists = useCallback(async () => {
    setListError(null);
    setLoadingList(true);
    try {
      const [accRes, rollRes] = await Promise.all([
        getJson<{ accounts: unknown[] }>("/api/accounts"),
        getJson<{ rollups: unknown[] }>("/api/rollups"),
      ]);
      const t = (accRes.accounts ?? []).map(toPursuitTeam);
      t.sort((a, b) =>
        (a.account_display || a.account).localeCompare(b.account_display || b.account, undefined, {
          sensitivity: "base",
        }),
      );
      setTeams(t);
      const m = new Map<string, AccountRollup>();
      for (const r of rollRes.rollups ?? []) {
        const rollup = toAccountRollup(r);
        if (rollup?.account) m.set(rollup.account, rollup);
      }
      setRollupByAccount(m);
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Failed to load accounts");
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    void loadLists();
  }, [loadLists]);

  const loadDetail = useCallback(async (account: string) => {
    setLoadingDetail(true);
    setDetail(null);
    setSelectedRollup(null);
    setEditingName(false);
    try {
      const teamRaw = await getJson<unknown>(`/api/accounts/${encodeURIComponent(account)}`);
      const t = toPursuitTeam(teamRaw);
      setDetail(t);
      setFormDisplay(t.account_display || t.account);
      setFormNotes(t.notes ?? "");
      setFormMembers([...(t.members ?? [])]);
    } catch {
      setDetail(null);
    }
    try {
      const r = await getJson<unknown>(`/api/rollups/${encodeURIComponent(account)}`);
      setSelectedRollup(toAccountRollup(r));
    } catch {
      setSelectedRollup(null);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedAccount) return;
    void loadDetail(selectedAccount);
  }, [selectedAccount, loadDetail]);

  const effectiveRollup = useMemo(() => {
    if (!selectedAccount) return null;
    return selectedRollup ?? rollupByAccount.get(selectedAccount) ?? null;
  }, [selectedAccount, selectedRollup, rollupByAccount]);

  const save = async () => {
    if (!selectedAccount) return;
    setSaving(true);
    try {
      const headers = { "X-Acting-User": resolveActingUser() };
      await putJson(
        `/api/accounts/${encodeURIComponent(selectedAccount)}`,
        {
          account_display: formDisplay,
          members: formMembers,
          notes: formNotes,
        },
        { headers },
      );
      setEditingName(false);
      await loadLists();
      await loadDetail(selectedAccount);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const createAccount = async () => {
    const account = newForm.account.trim();
    if (!account) {
      window.alert("Account id is required");
      return;
    }
    setSaving(true);
    try {
      const headers = { "X-Acting-User": resolveActingUser() };
      await postJson(
        "/api/accounts",
        {
          account,
          account_display: newForm.account_display.trim() || account,
          members: [],
          notes: "",
        },
        { headers },
      );
      setShowNew(false);
      setNewForm({ account: "", account_display: "" });
      await loadLists();
      setSelectedAccount(account);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Create failed");
    } finally {
      setSaving(false);
    }
  };

  const removeMember = (email: string) => {
    setFormMembers((m) => m.filter((x) => x.email.toLowerCase() !== email.toLowerCase()));
  };

  const addMember = () => {
    const email = newMember.email.trim();
    if (!email) return;
    if (formMembers.some((m) => m.email.toLowerCase() === email.toLowerCase())) return;
    setFormMembers((m) => [
      ...m,
      { email, name: newMember.name.trim() || email, role: newMember.role },
    ]);
    setNewMember({ email: "", name: "", role: "SA" });
  };

  return (
    <div className="flex h-[min(80vh,900px)] max-w-6xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">Accounts</h2>
        <button
          type="button"
          onClick={() => setShowNew((s) => !s)}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          New Account
        </button>
      </div>

      {showNew ? (
        <div className="rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 p-4 shadow-sm">
          <p className="text-sm font-medium text-slate-900 dark:text-white">Create pursuit team</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <input
              className="rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm"
              placeholder="Account id (e.g. acme_corp)"
              value={newForm.account}
              onChange={(e) => setNewForm((f) => ({ ...f, account: e.target.value }))}
            />
            <input
              className="rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm"
              placeholder="Display name"
              value={newForm.account_display}
              onChange={(e) => setNewForm((f) => ({ ...f, account_display: e.target.value }))}
            />
          </div>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => void createAccount()}
              disabled={saving}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => setShowNew(false)}
              className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {listError ? (
        <div className="rounded-lg border border-rose-200 dark:border-rose-500/40 bg-rose-50 dark:bg-rose-500/10 px-4 py-3 text-sm text-rose-900 dark:text-rose-200">{listError}</div>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 md:grid-cols-3">
        <div className="overflow-hidden rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 shadow-sm md:col-span-1">
          <div className="border-b border-slate-100 dark:border-slate-800 px-3 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400">
            Accounts
          </div>
          <div className="max-h-full overflow-y-auto p-2">
            {loadingList ? (
              <div className="flex justify-center py-8">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 dark:border-slate-800 border-t-slate-600" />
              </div>
            ) : teams.length === 0 ? (
              <p className="px-2 py-4 text-sm text-slate-500 dark:text-slate-400">No accounts yet.</p>
            ) : (
              <ul className="space-y-1">
                {teams.map((t) => {
                  const key = t.account;
                  const rollup = rollupByAccount.get(key);
                  const last = rollup?.last_meeting_date
                    ? new Date(rollup.last_meeting_date).toLocaleDateString()
                    : "—";
                  const selected = selectedAccount === key;
                  return (
                    <li key={key}>
                      <button
                        type="button"
                        onClick={() => setSelectedAccount(key)}
                        className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                          selected
                            ? "border-blue-500 bg-blue-50/50 ring-1 ring-blue-200"
                            : "border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800"
                        }`}
                      >
                        <p className="font-medium text-slate-900 dark:text-white">{t.account_display || t.account}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {(t.members?.length ?? 0)} members · Last meeting: {last}
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div className="overflow-y-auto rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 p-4 shadow-sm md:col-span-2">
          {!selectedAccount ? (
            <div className="flex min-h-[240px] items-center justify-center text-slate-500 dark:text-slate-400">
              Select an account to view details
            </div>
          ) : loadingDetail && !detail ? (
            <div className="flex min-h-[240px] items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 dark:border-slate-800 border-t-slate-600" />
            </div>
          ) : !detail ? (
            <p className="text-sm text-rose-600">Could not load account.</p>
          ) : (
            <div className="space-y-6">
              <div>
                {editingName ? (
                  <input
                    className="w-full max-w-md rounded-lg border border-slate-200 dark:border-slate-800 px-2 py-1 text-2xl font-semibold"
                    value={formDisplay}
                    onChange={(e) => setFormDisplay(e.target.value)}
                    onBlur={() => setEditingName(false)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") setEditingName(false);
                    }}
                    autoFocus
                  />
                ) : (
                  <h2
                    className="cursor-text text-2xl font-semibold text-slate-900 dark:text-white"
                    onClick={() => setEditingName(true)}
                    title="Click to edit"
                  >
                    {formDisplay || detail.account}
                  </h2>
                )}
              </div>

              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <Stat label="Meetings" value={String(effectiveRollup?.meeting_count ?? "—")} />
                <Stat
                  label="Last meeting"
                  value={
                    effectiveRollup?.last_meeting_date
                      ? new Date(effectiveRollup.last_meeting_date).toLocaleDateString()
                      : "—"
                  }
                />
                <Stat label="Open action items" value={String(effectiveRollup?.open_action_items ?? "—")} />
                <Stat
                  label="Momentum"
                  value={effectiveRollup?.momentum_score != null ? String(effectiveRollup.momentum_score) : "—"}
                />
                <div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Sentiment</p>
                  <span
                    className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${sentimentBadgeClass(
                      effectiveRollup?.latest_sentiment,
                    )}`}
                  >
                    {effectiveRollup?.latest_sentiment ?? "—"}
                  </span>
                </div>
              </div>

              <section>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Pursuit team</h3>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[480px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                        <th className="py-2 pr-2">Email</th>
                        <th className="py-2 pr-2">Name</th>
                        <th className="py-2 pr-2">Role</th>
                        <th className="py-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {formMembers.map((m) => (
                        <tr key={m.email} className="border-b border-slate-100 dark:border-slate-800">
                          <td className="py-2 pr-2 text-slate-800 dark:text-slate-100">{m.email}</td>
                          <td className="py-2 pr-2 text-slate-800 dark:text-slate-100">{m.name}</td>
                          <td className="py-2 pr-2">
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${roleBadgeClass(m.role)}`}
                            >
                              {m.role}
                            </span>
                          </td>
                          <td className="py-2">
                            <button
                              type="button"
                              onClick={() => removeMember(m.email)}
                              className="text-rose-600 hover:text-rose-800"
                              title="Remove"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <input
                    className="min-w-[140px] flex-1 rounded-lg border border-slate-200 dark:border-slate-800 px-2 py-1.5 text-sm"
                    placeholder="Email"
                    value={newMember.email}
                    onChange={(e) => setNewMember((f) => ({ ...f, email: e.target.value }))}
                  />
                  <input
                    className="min-w-[120px] flex-1 rounded-lg border border-slate-200 dark:border-slate-800 px-2 py-1.5 text-sm"
                    placeholder="Name"
                    value={newMember.name}
                    onChange={(e) => setNewMember((f) => ({ ...f, name: e.target.value }))}
                  />
                  <select
                    className="rounded-lg border border-slate-200 dark:border-slate-800 px-2 py-1.5 text-sm"
                    value={newMember.role}
                    onChange={(e) =>
                      setNewMember((f) => ({ ...f, role: e.target.value as PursuitTeamMember["role"] }))
                    }
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={addMember}
                    className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    Add
                  </button>
                </div>
              </section>

              <section>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Notes</h3>
                <textarea
                  className="mt-2 w-full min-h-[100px] rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Account notes"
                />
              </section>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={saving}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
      <p className="text-sm font-medium text-slate-900 dark:text-white">{value}</p>
    </div>
  );
}
