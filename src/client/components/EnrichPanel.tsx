import { useMemo, type ReactNode } from "react";
import type { EnrichmentForm, LookupRow, OpportunityRow } from "../types/index.js";
import Collapsible from "./Collapsible.js";

export interface LookupsBundle {
  accounts: LookupRow[];
  opportunities: LookupRow[];
  meetingTypes: LookupRow[];
  tags: LookupRow[];
  salesStages: LookupRow[];
  teamEmails: string[];
  opportunityRows?: OpportunityRow[];
}

function fieldCls(empty = false) {
  return [
    "mt-1 w-full rounded-lg border bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white shadow-sm focus:outline-none focus:ring-2",
    empty
      ? "border-amber-300 dark:border-amber-600 focus:border-amber-400 focus:ring-amber-100 dark:focus:ring-amber-900/30"
      : "border-slate-200 dark:border-slate-800 focus:border-slate-400 focus:ring-slate-200",
  ].join(" ");
}

function Lab({
  children,
  hint,
  required,
  recommended,
}: {
  children: ReactNode;
  hint?: string;
  required?: boolean;
  recommended?: boolean;
}) {
  return (
    <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
      <span className="flex items-center gap-1">
        {children}
        {required && (
          <span className="text-rose-500 font-bold" title="Required">*</span>
        )}
        {recommended && !required && (
          <span className="text-blue-500 font-bold" title="Recommended">✦</span>
        )}
      </span>
      {hint ? <span className="mt-0.5 block font-normal text-slate-400 dark:text-slate-500">{hint}</span> : null}
    </label>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 pt-1">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 whitespace-nowrap">
        {children}
      </span>
      <div className="flex-1 border-t border-slate-100 dark:border-slate-800" />
    </div>
  );
}

interface CheckItem {
  label: string;
  done: boolean;
  required: boolean;
}

function CompletenessBar({ items }: { items: CheckItem[] }) {
  const required = items.filter((i) => i.required);
  const recommended = items.filter((i) => !i.required);
  const reqDone = required.filter((i) => i.done).length;
  const recDone = recommended.filter((i) => i.done).length;
  const allReqDone = reqDone === required.length;

  return (
    <div className="rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Enrichment checklist</h3>
        {allReqDone ? (
          <span className="rounded-full bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
            Ready to ingest
          </span>
        ) : (
          <span className="rounded-full bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
            {required.length - reqDone} required missing
          </span>
        )}
      </div>

      <div className="space-y-1">
        {required.map((item) => (
          <div key={item.label} className="flex items-center gap-2 text-xs">
            {item.done ? (
              <span className="text-emerald-500 shrink-0">✓</span>
            ) : (
              <span className="text-amber-500 shrink-0">○</span>
            )}
            <span className={item.done ? "text-slate-500 dark:text-slate-400 line-through" : "text-slate-700 dark:text-slate-200 font-medium"}>
              {item.label}
            </span>
            <span className="ml-auto shrink-0 rounded px-1 py-px text-[10px] font-semibold bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400">
              Required
            </span>
          </div>
        ))}

        {recDone < recommended.length && (
          <div className="pt-1 mt-1 border-t border-slate-100 dark:border-slate-800 space-y-1">
            {recommended.map((item) =>
              item.done ? null : (
                <div key={item.label} className="flex items-center gap-2 text-xs">
                  <span className="text-slate-300 dark:text-slate-600 shrink-0">○</span>
                  <span className="text-slate-500 dark:text-slate-400">{item.label}</span>
                  <span className="ml-auto shrink-0 rounded px-1 py-px text-[10px] font-medium bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400">
                    Recommended
                  </span>
                </div>
              ),
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function EnrichPanel({
  form,
  onChange,
  lookups,
  suggestedTags,
  onAddLookup,
}: {
  form: EnrichmentForm;
  onChange: (next: EnrichmentForm) => void;
  lookups: LookupsBundle;
  suggestedTags: string[];
  onAddLookup: (row: { type: string; value: string; label: string }) => Promise<void>;
}) {
  const patch = (p: Partial<EnrichmentForm>) => onChange({ ...form, ...p });

  const toggleTag = (t: string) => {
    const set = new Set(form.tags);
    if (set.has(t)) set.delete(t);
    else set.add(t);
    patch({ tags: [...set] });
  };

  const addNewLookup = async (type: "account" | "opportunity" | "tag", raw: string) => {
    const v = raw.trim();
    if (!v) return;
    await onAddLookup({ type, value: v, label: v });
    if (type === "account") patch({ account: v });
    if (type === "opportunity") patch({ opportunity: v });
    if (type === "tag") patch({ tags: [...new Set([...form.tags, v])] });
  };

  const dimSuggested = suggestedTags.filter((t) => !form.tags.includes(t));

  const oppOptions = useMemo(() => {
    const rows = lookups.opportunityRows ?? [];
    const filtered = form.account
      ? rows.filter(
          (r) => r.account.toLowerCase().trim() === form.account.toLowerCase().trim(),
        )
      : rows;
    return filtered.length ? filtered : rows;
  }, [lookups.opportunityRows, form.account]);

  const patchTechWin = (p: Partial<EnrichmentForm["tech_win"]>) =>
    patch({ tech_win: { ...form.tech_win, ...p } });

  const TECH_STATUS_DOTS: Record<"red" | "yellow" | "green", string> = {
    red: "bg-rose-500",
    yellow: "bg-amber-400",
    green: "bg-emerald-500",
  };

  const checklistItems: CheckItem[] = [
    { label: "Account", done: Boolean(form.account && form.account !== "unassigned"), required: true },
    { label: "Opportunity (spine)", done: Boolean(form.tech_win.opportunity_id), required: true },
    { label: "Meeting type", done: Boolean(form.meeting_type), required: true },
    { label: "Sales stage", done: Boolean(form.sales_stage), required: true },
    { label: "Tech Status (RYG)", done: Boolean(form.tech_win.tech_status), required: false },
    { label: "Path to Tech Win", done: Boolean(form.tech_win.path_to_tech_win), required: false },
    { label: "What changed", done: Boolean(form.tech_win.what_changed), required: false },
  ];

  return (
    <div className="flex max-h-[calc(100vh-8rem)] flex-col gap-4 overflow-y-auto pr-1">

      {/* Completeness checklist */}
      <CompletenessBar items={checklistItems} />

      {/* Classification — Required fields first, then optional */}
      <div className="rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Classification</h3>
          <span className="text-[10px] text-slate-400 dark:text-slate-500 flex items-center gap-2">
            <span><span className="text-rose-500 font-bold">*</span> required</span>
            <span><span className="text-blue-500 font-bold">✦</span> recommended</span>
          </span>
        </div>

        <SectionLabel>Required</SectionLabel>

        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <div>
            <Lab required>Account</Lab>
            <select
              className={fieldCls(!form.account)}
              value={form.account}
              onChange={(e) => patch({ account: e.target.value })}
            >
              <option value="">Select account…</option>
              {lookups.accounts.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
            <input
              placeholder="Or type a new account (Enter)"
              className={`${fieldCls()} mt-2`}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  void addNewLookup("account", (e.target as HTMLInputElement).value);
                  (e.target as HTMLInputElement).value = "";
                }
              }}
            />
          </div>
          <div>
            <Lab required hint="Links note to the opportunity spine for dashboards">
              Opportunity (spine)
            </Lab>
            <select
              className={fieldCls(!form.tech_win.opportunity_id)}
              value={form.tech_win.opportunity_id}
              onChange={(e) => patchTechWin({ opportunity_id: e.target.value })}
            >
              <option value="">Select opportunity…</option>
              {oppOptions.map((o) => (
                <option key={o.opp_id} value={o.opp_id}>
                  {o.opp_name ? `${o.opp_name} · ${o.account}` : `${o.opp_id} · ${o.account}`}
                  {o.acv ? ` · $${Math.round(o.acv).toLocaleString()}` : ""}
                  {o.forecast_category ? ` · ${o.forecast_category}` : ""}
                </option>
              ))}
            </select>
            {form.account && lookups.opportunityRows?.length && oppOptions.length === 0 ? (
              <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                No opportunities for {form.account}. Add a row to data/opportunities.csv and re-run
                npm run seed:opportunities.
              </p>
            ) : null}
          </div>
          <div>
            <Lab required>Meeting type</Lab>
            <select
              className={fieldCls(!form.meeting_type)}
              value={form.meeting_type}
              onChange={(e) => patch({ meeting_type: e.target.value })}
            >
              <option value="">Select type…</option>
              {lookups.meetingTypes.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Lab required>Sales stage</Lab>
            <select
              className={fieldCls(!form.sales_stage)}
              value={form.sales_stage}
              onChange={(e) => patch({ sales_stage: e.target.value })}
            >
              <option value="">Select stage…</option>
              {lookups.salesStages.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4">
          <SectionLabel>Optional</SectionLabel>

          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <div>
              <Lab>Lookup — Opportunity name</Lab>
              <select
                className={fieldCls()}
                value={form.opportunity}
                onChange={(e) => patch({ opportunity: e.target.value })}
              >
                <option value="">Select…</option>
                {lookups.opportunities.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </select>
              <input
                placeholder="Add new opportunity label"
                className={`${fieldCls()} mt-2`}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    void addNewLookup("opportunity", (e.target as HTMLInputElement).value);
                    (e.target as HTMLInputElement).value = "";
                  }
                }}
              />
            </div>
            <div className="sm:col-span-1">
              <Lab>Meeting purpose</Lab>
              <textarea
                className={fieldCls()}
                rows={2}
                value={form.meeting_purpose}
                onChange={(e) => patch({ meeting_purpose: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <Lab>Scheduled by</Lab>
              <input
                className={fieldCls()}
                value={form.scheduled_by}
                onChange={(e) => patch({ scheduled_by: e.target.value })}
              />
            </div>
          </div>

          <div className="mt-3">
            <Lab>Tags</Lab>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {form.tags.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleTag(t)}
                  className="rounded-full bg-slate-900 px-2.5 py-0.5 text-xs font-medium text-white"
                >
                  {t} ×
                </button>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {lookups.tags.map((t) =>
                form.tags.includes(t.value) ? null : (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => toggleTag(t.value)}
                    className="rounded-full border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-0.5 text-xs text-slate-600 dark:text-slate-300 hover:border-slate-300"
                  >
                    + {t.label}
                  </button>
                ),
              )}
            </div>
            {dimSuggested.length ? (
              <div className="mt-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  Suggested
                </p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {dimSuggested.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => toggleTag(t)}
                      className="rounded-full border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 px-2.5 py-0.5 text-xs text-slate-500 dark:text-slate-400 hover:border-slate-400 hover:text-slate-700"
                    >
                      + {t}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <input
              placeholder="Add tag (Enter)"
              className={`${fieldCls()} mt-2`}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  void addNewLookup("tag", (e.target as HTMLInputElement).value);
                  (e.target as HTMLInputElement).value = "";
                }
              }}
            />
          </div>
        </div>
      </div>

      {/* Tech Win — Recommended */}
      <Collapsible
        title="Tech Win (RYG, Path, Next Milestone)"
        badge="Recommended"
        defaultOpen={
          Boolean(
            form.tech_win.tech_status ||
              form.tech_win.path_to_tech_win ||
              form.tech_win.what_changed ||
              form.tech_win.opportunity_id,
          )
        }
      >
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Lab hint="Today's call: where does this opp's tech stand?" recommended>
                Tech Status (RYG)
              </Lab>
              <div className="mt-1 flex gap-2">
                {(["red", "yellow", "green"] as const).map((s) => {
                  const active = form.tech_win.tech_status === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => patchTechWin({ tech_status: active ? "" : s })}
                      className={`flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium capitalize ${
                        active
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <span className={`h-2 w-2 rounded-full ${TECH_STATUS_DOTS[s]}`} />
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <Lab hint="One-line reason for this RYG.">Tech Status reason</Lab>
              <textarea
                className={fieldCls()}
                rows={2}
                value={form.tech_win.tech_status_reason}
                onChange={(e) => patchTechWin({ tech_status_reason: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Lab hint="Kevin's #1 ask. The technical steps left to win." recommended>
              Path to Tech Win
            </Lab>
            <textarea
              className={fieldCls(!form.tech_win.path_to_tech_win)}
              rows={3}
              value={form.tech_win.path_to_tech_win}
              onChange={(e) => patchTechWin({ path_to_tech_win: e.target.value })}
            />
          </div>
          <div>
            <Lab hint="Delta since last week. Drives the Friday digest." recommended>What changed</Lab>
            <textarea
              className={fieldCls(!form.tech_win.what_changed)}
              rows={2}
              value={form.tech_win.what_changed}
              onChange={(e) => patchTechWin({ what_changed: e.target.value })}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Lab>Next milestone date</Lab>
              <input
                type="date"
                className={fieldCls()}
                value={form.tech_win.next_milestone_date}
                onChange={(e) => patchTechWin({ next_milestone_date: e.target.value })}
              />
            </div>
            <div>
              <Lab>Next milestone description</Lab>
              <input
                className={fieldCls()}
                value={form.tech_win.next_milestone_description}
                onChange={(e) => patchTechWin({ next_milestone_description: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Lab hint="What you need from the team to move this forward.">Help needed</Lab>
            <textarea
              className={fieldCls()}
              rows={2}
              value={form.tech_win.help_needed}
              onChange={(e) => patchTechWin({ help_needed: e.target.value })}
            />
          </div>
        </div>
      </Collapsible>

      {/* Optional collapsibles */}
      <Collapsible title="Attendees" badge="Optional" defaultOpen={form.attendees.length > 0}>
        <div className="space-y-2">
          {form.attendees.map((row, i) => (
            <div key={i} className="grid gap-2 rounded-lg border border-slate-100 dark:border-slate-800 p-2 sm:grid-cols-2">
              {(["name", "title", "company", "email"] as const).map((k) => (
                <input
                  key={k}
                  className={fieldCls()}
                  placeholder={k}
                  value={String(row[k] ?? "")}
                  onChange={(e) => {
                    const next = [...form.attendees];
                    next[i] = { ...row, [k]: e.target.value };
                    patch({ attendees: next });
                  }}
                />
              ))}
              <select
                className={fieldCls()}
                value={row.role_flag ?? "none"}
                onChange={(e) => {
                  const next = [...form.attendees];
                  next[i] = { ...row, role_flag: e.target.value };
                  patch({ attendees: next });
                }}
              >
                {[
                  "none",
                  "decision_maker",
                  "champion",
                  "technical_evaluator",
                  "executive_sponsor",
                  "end_user",
                ].map((r) => (
                  <option key={r} value={r}>
                    {r.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="text-xs text-rose-600 hover:underline"
                onClick={() => patch({ attendees: form.attendees.filter((_, j) => j !== i) })}
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            className="text-sm font-medium text-slate-700 dark:text-slate-200 hover:text-slate-900"
            onClick={() =>
              patch({
                attendees: [
                  ...form.attendees,
                  { name: "", title: "", company: "", email: "", role_flag: "none" },
                ],
              })
            }
          >
            + Add attendee
          </button>
        </div>
      </Collapsible>

      <Collapsible title="Action items" badge="Optional" defaultOpen={form.action_items.length > 0}>
        <div className="space-y-2">
          {form.action_items.map((row, i) => (
            <div key={i} className="grid gap-2 rounded-lg border border-slate-100 dark:border-slate-800 p-2">
              <textarea
                className={fieldCls()}
                placeholder="Description"
                rows={2}
                value={row.description ?? ""}
                onChange={(e) => {
                  const next = [...form.action_items];
                  next[i] = { ...row, description: e.target.value };
                  patch({ action_items: next });
                }}
              />
              <div className="grid gap-2 sm:grid-cols-3">
                <select
                  className={fieldCls()}
                  value={row.owner ?? ""}
                  onChange={(e) => {
                    const next = [...form.action_items];
                    next[i] = { ...row, owner: e.target.value };
                    patch({ action_items: next });
                  }}
                >
                  <option value="">Owner…</option>
                  {lookups.teamEmails.map((e) => (
                    <option key={e} value={e}>
                      {e}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  className={fieldCls()}
                  value={(row.due_date ?? "").slice(0, 10)}
                  onChange={(e) => {
                    const next = [...form.action_items];
                    next[i] = { ...row, due_date: e.target.value };
                    patch({ action_items: next });
                  }}
                />
                <select
                  className={fieldCls()}
                  value={row.status ?? "open"}
                  onChange={(e) => {
                    const next = [...form.action_items];
                    next[i] = { ...row, status: e.target.value };
                    patch({ action_items: next });
                  }}
                >
                  <option value="open">open</option>
                  <option value="done">done</option>
                </select>
              </div>
              <button
                type="button"
                className="text-xs text-rose-600 hover:underline"
                onClick={() =>
                  patch({ action_items: form.action_items.filter((_, j) => j !== i) })
                }
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            className="text-sm font-medium text-slate-700 dark:text-slate-200"
            onClick={() =>
              patch({
                action_items: [
                  ...form.action_items,
                  { description: "", owner: "", due_date: "", status: "open" },
                ],
              })
            }
          >
            + Add action item
          </button>
        </div>
      </Collapsible>

      <Collapsible title="Commitments" badge="Optional" defaultOpen={form.commitments.length > 0}>
        <div className="space-y-2">
          {form.commitments.map((row, i) => (
            <div key={i} className="grid gap-2 rounded-lg border border-slate-100 dark:border-slate-800 p-2">
              <textarea
                className={fieldCls()}
                rows={2}
                value={row.description ?? ""}
                onChange={(e) => {
                  const next = [...form.commitments];
                  next[i] = { ...row, description: e.target.value };
                  patch({ commitments: next });
                }}
              />
              <div className="grid gap-2 sm:grid-cols-2">
                <select
                  className={fieldCls()}
                  value={row.committed_by ?? ""}
                  onChange={(e) => {
                    const next = [...form.commitments];
                    next[i] = { ...row, committed_by: e.target.value };
                    patch({ commitments: next });
                  }}
                >
                  <option value="">Committed by…</option>
                  {lookups.teamEmails.map((e) => (
                    <option key={e} value={e}>
                      {e}
                    </option>
                  ))}
                </select>
                <input
                  className={fieldCls()}
                  placeholder="Timeline"
                  value={row.timeline ?? ""}
                  onChange={(e) => {
                    const next = [...form.commitments];
                    next[i] = { ...row, timeline: e.target.value };
                    patch({ commitments: next });
                  }}
                />
              </div>
              <button
                type="button"
                className="text-xs text-rose-600 hover:underline"
                onClick={() =>
                  patch({ commitments: form.commitments.filter((_, j) => j !== i) })
                }
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            className="text-sm font-medium text-slate-700 dark:text-slate-200"
            onClick={() =>
              patch({
                commitments: [
                  ...form.commitments,
                  { description: "", committed_by: "", timeline: "" },
                ],
              })
            }
          >
            + Add commitment
          </button>
        </div>
      </Collapsible>

      <Collapsible
        title="Technical environment"
        badge="Optional"
        defaultOpen={Object.values(form.technical_environment).some(Boolean)}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ["current_stack", "Current stack"],
              ["pain_points", "Pain points"],
              ["requirements", "Requirements"],
              ["scale", "Scale"],
              ["integrations", "Integrations"],
              ["constraints", "Constraints"],
            ] as const
          ).map(([k, label]) => (
            <div key={k} className="sm:col-span-2">
              <Lab>{label}</Lab>
              <textarea
                className={fieldCls()}
                rows={2}
                value={form.technical_environment[k]}
                onChange={(e) =>
                  patch({
                    technical_environment: { ...form.technical_environment, [k]: e.target.value },
                  })
                }
              />
            </div>
          ))}
        </div>
      </Collapsible>

      <Collapsible
        title="Customer sentiment"
        badge="Optional"
        defaultOpen={Object.values(form.customer_sentiment).some(Boolean)}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Lab>Overall</Lab>
            <select
              className={fieldCls()}
              value={form.customer_sentiment.overall}
              onChange={(e) =>
                patch({
                  customer_sentiment: { ...form.customer_sentiment, overall: e.target.value },
                })
              }
            >
              {["", "enthusiastic", "positive", "neutral", "cautious", "concerned", "skeptical"].map(
                (x) => (
                  <option key={x || "unset"} value={x}>
                    {x || "—"}
                  </option>
                ),
              )}
            </select>
          </div>
          {(["concerns", "objections", "champion_signals"] as const).map((k) => (
            <div key={k} className="sm:col-span-2">
              <Lab>{k.replace(/_/g, " ")}</Lab>
              <textarea
                className={fieldCls()}
                rows={2}
                value={form.customer_sentiment[k]}
                onChange={(e) =>
                  patch({
                    customer_sentiment: { ...form.customer_sentiment, [k]: e.target.value },
                  })
                }
              />
            </div>
          ))}
        </div>
      </Collapsible>

      <Collapsible
        title="Competitive landscape"
        badge="Optional"
        defaultOpen={
          Boolean(form.competitive_landscape.incumbent) ||
          form.competitive_landscape.competitors_evaluating.length > 0
        }
      >
        <div className="space-y-3">
          <div>
            <Lab>Incumbent</Lab>
            <textarea
              className={fieldCls()}
              rows={2}
              value={form.competitive_landscape.incumbent}
              onChange={(e) =>
                patch({
                  competitive_landscape: {
                    ...form.competitive_landscape,
                    incumbent: e.target.value,
                  },
                })
              }
            />
          </div>
          <div>
            <Lab>Competitors evaluating (comma-separated)</Lab>
            <input
              className={fieldCls()}
              value={form.competitive_landscape.competitors_evaluating.join(", ")}
              onChange={(e) =>
                patch({
                  competitive_landscape: {
                    ...form.competitive_landscape,
                    competitors_evaluating: e.target.value
                      .split(/[,;]+/)
                      .map((s) => s.trim())
                      .filter(Boolean),
                  },
                })
              }
            />
          </div>
          <div>
            <Lab>Mentions</Lab>
            <textarea
              className={fieldCls()}
              rows={2}
              value={form.competitive_landscape.mentions}
              onChange={(e) =>
                patch({
                  competitive_landscape: {
                    ...form.competitive_landscape,
                    mentions: e.target.value,
                  },
                })
              }
            />
          </div>
          <div>
            <Lab>Differentiators</Lab>
            <textarea
              className={fieldCls()}
              rows={2}
              value={form.competitive_landscape.differentiators}
              onChange={(e) =>
                patch({
                  competitive_landscape: {
                    ...form.competitive_landscape,
                    differentiators: e.target.value,
                  },
                })
              }
            />
          </div>
        </div>
      </Collapsible>

      <Collapsible
        title="Budget, timeline & procurement"
        badge="Optional"
        defaultOpen={Object.values(form.budget_timeline).some(Boolean)}
      >
        <div className="grid gap-3">
          {(["budget", "timeline", "procurement", "stage_signals"] as const).map((k) => (
            <div key={k}>
              <Lab>{k.replace(/_/g, " ")}</Lab>
              <textarea
                className={fieldCls()}
                rows={2}
                value={form.budget_timeline[k]}
                onChange={(e) =>
                  patch({ budget_timeline: { ...form.budget_timeline, [k]: e.target.value } })
                }
              />
            </div>
          ))}
        </div>
      </Collapsible>

      <Collapsible
        title="Demo / POC request"
        badge="Optional"
        defaultOpen={Object.values(form.demo_poc_request).some(Boolean)}
      >
        <div className="grid gap-3">
          {(
            [
              "description",
              "requirements",
              "data_available",
              "timeline",
              "success_criteria",
              "audience",
            ] as const
          ).map((k) => (
            <div key={k}>
              <Lab>{k.replace(/_/g, " ")}</Lab>
              <textarea
                className={fieldCls()}
                rows={2}
                value={form.demo_poc_request[k]}
                onChange={(e) =>
                  patch({ demo_poc_request: { ...form.demo_poc_request, [k]: e.target.value } })
                }
              />
            </div>
          ))}
        </div>
      </Collapsible>

      <Collapsible
        title="Resources"
        badge="Optional"
        defaultOpen={
          Boolean(form.resources_shared) ||
          Boolean(form.resources_requested_by_customer) ||
          Boolean(form.resources_requested_by_us)
        }
      >
        <div className="space-y-3">
          <div>
            <Lab>Shared</Lab>
            <textarea
              className={fieldCls()}
              rows={2}
              value={form.resources_shared}
              onChange={(e) => patch({ resources_shared: e.target.value })}
            />
          </div>
          <div>
            <Lab>Requested by customer</Lab>
            <textarea
              className={fieldCls()}
              rows={2}
              value={form.resources_requested_by_customer}
              onChange={(e) => patch({ resources_requested_by_customer: e.target.value })}
            />
          </div>
          <div>
            <Lab>Requested by us</Lab>
            <textarea
              className={fieldCls()}
              rows={2}
              value={form.resources_requested_by_us}
              onChange={(e) => patch({ resources_requested_by_us: e.target.value })}
            />
          </div>
        </div>
      </Collapsible>

      <Collapsible
        title="Next meeting"
        badge="Optional"
        defaultOpen={Boolean(form.next_meeting.date) || Boolean(form.next_meeting.agenda)}
      >
        <div className="space-y-3">
          <div>
            <Lab>Date</Lab>
            <input
              type="date"
              className={fieldCls()}
              value={form.next_meeting.date}
              onChange={(e) =>
                patch({ next_meeting: { ...form.next_meeting, date: e.target.value } })
              }
            />
          </div>
          <div>
            <Lab>Agenda</Lab>
            <textarea
              className={fieldCls()}
              rows={2}
              value={form.next_meeting.agenda}
              onChange={(e) =>
                patch({ next_meeting: { ...form.next_meeting, agenda: e.target.value } })
              }
            />
          </div>
          <div>
            <Lab>Attendees (comma-separated emails)</Lab>
            <input
              className={fieldCls()}
              value={form.next_meeting.attendees.join(", ")}
              onChange={(e) =>
                patch({
                  next_meeting: {
                    ...form.next_meeting,
                    attendees: e.target.value
                      .split(/[,;]+/)
                      .map((s) => s.trim())
                      .filter(Boolean),
                  },
                })
              }
            />
          </div>
        </div>
      </Collapsible>

      <Collapsible title="Open questions" badge="Optional" defaultOpen={Boolean(form.open_questions)}>
        <textarea
          className={fieldCls()}
          rows={4}
          value={form.open_questions}
          onChange={(e) => patch({ open_questions: e.target.value })}
        />
      </Collapsible>

      <Collapsible
        title="Key topics & decisions"
        badge="Optional"
        defaultOpen={Boolean(form.key_topics || form.decisions_made)}
      >
        <div className="space-y-3">
          <div>
            <Lab>Key topics</Lab>
            <textarea
              className={fieldCls()}
              rows={3}
              value={form.key_topics}
              onChange={(e) => patch({ key_topics: e.target.value })}
            />
          </div>
          <div>
            <Lab>Decisions made</Lab>
            <textarea
              className={fieldCls()}
              rows={3}
              value={form.decisions_made}
              onChange={(e) => patch({ decisions_made: e.target.value })}
            />
          </div>
        </div>
      </Collapsible>
    </div>
  );
}
