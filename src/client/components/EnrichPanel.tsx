import type { ReactNode } from "react";
import type { EnrichmentForm, LookupRow } from "../types/index.js";
import Collapsible from "./Collapsible.js";

export interface LookupsBundle {
  accounts: LookupRow[];
  opportunities: LookupRow[];
  meetingTypes: LookupRow[];
  tags: LookupRow[];
  salesStages: LookupRow[];
  teamEmails: string[];
}

function fieldCls() {
  return "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200";
}

function Lab({
  children,
  hint,
}: {
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block text-xs font-medium text-slate-600">
      <span className="flex items-center gap-1">{children}</span>
      {hint ? <span className="mt-0.5 block font-normal text-slate-400">{hint}</span> : null}
    </label>
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

  return (
    <div className="flex max-h-[calc(100vh-8rem)] flex-col gap-4 overflow-y-auto pr-1">
      <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900">Classification</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <Lab>Account</Lab>
            <select
              className={fieldCls()}
              value={form.account}
              onChange={(e) => patch({ account: e.target.value })}
            >
              <option value="">Select…</option>
              {lookups.accounts.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
            <input
              placeholder="Add new account"
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
            <Lab>Opportunity</Lab>
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
              placeholder="Add new opportunity"
              className={`${fieldCls()} mt-2`}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  void addNewLookup("opportunity", (e.target as HTMLInputElement).value);
                  (e.target as HTMLInputElement).value = "";
                }
              }}
            />
          </div>
          <div>
            <Lab>Meeting type</Lab>
            <select
              className={fieldCls()}
              value={form.meeting_type}
              onChange={(e) => patch({ meeting_type: e.target.value })}
            >
              <option value="">Select…</option>
              {lookups.meetingTypes.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Lab>Sales stage</Lab>
            <select
              className={fieldCls()}
              value={form.sales_stage}
              onChange={(e) => patch({ sales_stage: e.target.value })}
            >
              <option value="">Select…</option>
              {lookups.salesStages.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
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

        <div className="mt-4">
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
                  className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-xs text-slate-600 hover:border-slate-300"
                >
                  + {t.label}
                </button>
              ),
            )}
          </div>
          {dimSuggested.length ? (
            <div className="mt-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                Suggested
              </p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {dimSuggested.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleTag(t)}
                    className="rounded-full border border-dashed border-slate-300 bg-slate-50 px-2.5 py-0.5 text-xs text-slate-500 hover:border-slate-400 hover:text-slate-700"
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

      <Collapsible title="Attendees" defaultOpen={form.attendees.length > 0}>
        <div className="space-y-2">
          {form.attendees.map((row, i) => (
            <div key={i} className="grid gap-2 rounded-lg border border-slate-100 p-2 sm:grid-cols-2">
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
            className="text-sm font-medium text-slate-700 hover:text-slate-900"
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

      <Collapsible title="Action items" defaultOpen={form.action_items.length > 0}>
        <div className="space-y-2">
          {form.action_items.map((row, i) => (
            <div key={i} className="grid gap-2 rounded-lg border border-slate-100 p-2">
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
            className="text-sm font-medium text-slate-700"
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

      <Collapsible title="Commitments" defaultOpen={form.commitments.length > 0}>
        <div className="space-y-2">
          {form.commitments.map((row, i) => (
            <div key={i} className="grid gap-2 rounded-lg border border-slate-100 p-2">
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
            className="text-sm font-medium text-slate-700"
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

      <Collapsible title="Open questions" defaultOpen={Boolean(form.open_questions)}>
        <textarea
          className={fieldCls()}
          rows={4}
          value={form.open_questions}
          onChange={(e) => patch({ open_questions: e.target.value })}
        />
      </Collapsible>

      <Collapsible title="Key topics & decisions" defaultOpen={Boolean(form.key_topics || form.decisions_made)}>
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
