import crypto from "node:crypto";
import { createElasticsearchClientFromEnv } from "../config/elastic-client.js";
import {
  ACTION_ITEMS_INDEX,
  NOTES_INDEX,
  PURSUIT_TEAM_INDEX,
  ROLLUPS_INDEX,
} from "../constants/elastic.js";
import { getElastic } from "../elastic-instance.js";
import { ElasticService } from "../services/elastic.js";
import { createSalesforceService } from "../services/salesforce.js";
import type { SalesforceService } from "../services/salesforce.js";

const elasticService: ElasticService = getElastic();
const esClient = createElasticsearchClientFromEnv();
const salesforceService: SalesforceService = createSalesforceService();

function nowMs(): number {
  return Date.now();
}

function str(v: unknown): string | undefined {
  if (typeof v === "string" && v.trim()) return v;
  return undefined;
}

function strReq(v: unknown, name: string): string {
  const s = str(v);
  if (!s) throw new TypeError(`Missing or invalid string parameter: ${name}`);
  return s;
}

function num(v: unknown, defaultVal: number): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) return Number(v);
  return defaultVal;
}

function optBool(v: unknown): boolean | undefined {
  if (typeof v === "boolean") return v;
  return undefined;
}

function logAgentAction(
  toolName: string,
  actingUser: string,
  input: Record<string, unknown>,
  outputSummary: string,
  latencyMs: number,
  sessionId?: string,
): void {
  void elasticService
    .logAgentAction({
      tool_name: toolName,
      acting_user: actingUser,
      input,
      output_summary: outputSummary.slice(0, 2000),
      latency_ms: latencyMs,
      session_id: sessionId,
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error("logAgentAction failed", err);
    });
}

function summarizeOutput(value: unknown): string {
  try {
    if (value === null || value === undefined) return "null";
    return JSON.stringify(value).slice(0, 500);
  } catch {
    return "[unserializable]";
  }
}

function wrap<T>(
  toolName: string,
  input: Record<string, unknown>,
  actingUser: string,
  sessionId: string | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  const t0 = nowMs();
  return fn().then(
    (result) => {
      logAgentAction(toolName, actingUser, input, summarizeOutput(result), nowMs() - t0, sessionId);
      return result;
    },
    (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      logAgentAction(
        toolName,
        actingUser,
        input,
        `error: ${msg}`.slice(0, 500),
        nowMs() - t0,
        sessionId,
      );
      throw err;
    },
  );
}

async function handleSearchNotes(
  p: Record<string, unknown>,
): Promise<{ total: number; page: number; size: number; notes: Record<string, unknown>[] }> {
  const query = strReq(p.query, "query");
  return elasticService.searchIngestedNotes({
    q: query,
    account: str(p.account),
    size: num(p.size ?? 10, 10),
    page: 1,
  });
}

async function handleSemanticSearch(p: Record<string, unknown>) {
  const query = strReq(p.query, "query");
  return elasticService.hybridSearch(query, {
    account: str(p.account),
    size: num(p.size ?? 8, 8),
  });
}

async function handleGetNoteById(p: Record<string, unknown>) {
  const noteId = strReq(p.note_id, "note_id");
  const doc = await elasticService.getIngestedNote(noteId);
  if (!doc) return { found: false, note_id: noteId };
  return { found: true, note: doc };
}

async function handleGetAccountBrief(p: Record<string, unknown>) {
  const account = strReq(p.account, "account");
  const rollup = await elasticService.getAccountRollup(account);
  if (!rollup) {
    return { account, message: "No rollup computed yet" as const };
  }
  return { account, rollup };
}

async function handleGetMeetingTimeline(p: Record<string, unknown>) {
  const account = strReq(p.account, "account");
  const limit = num(p.limit ?? 20, 20);
  return elasticService.searchIngestedNotes({
    account,
    size: limit,
    page: 1,
  });
}

async function handleListOpenActionItems(p: Record<string, unknown>) {
  return elasticService.listActionItems({
    account: str(p.account),
    owner: str(p.owner),
    status: "open",
    overdue: optBool(p.overdue_only),
  });
}

async function handleListFollowupsDue(p: Record<string, unknown>) {
  const account = str(p.account);
  const daysAhead = num(p.days_ahead ?? 7, 7);
  const end = new Date();
  end.setDate(end.getDate() + daysAhead);
  const endIso = end.toISOString();
  const startIso = new Date().toISOString();

  const mustFilterAction: object[] = [{ term: { status: "open" } }, { range: { due_date: { gte: startIso, lte: endIso } } }];
  if (account) mustFilterAction.push({ term: { account } });

  const [actionRes, noteRes] = await Promise.all([
    esClient.search<Record<string, unknown>>({
      index: ACTION_ITEMS_INDEX,
      size: 200,
      query: { bool: { filter: mustFilterAction } } as never,
      sort: [{ due_date: { order: "asc", unmapped_type: "date" } }],
    }),
    esClient.search<Record<string, unknown>>({
      index: NOTES_INDEX,
      size: 100,
      query: {
        bool: {
          filter: [
            ...(account ? [{ term: { account } }] : []),
            { range: { "next_meeting.date": { gte: startIso, lte: endIso } } },
          ],
        },
      } as never,
      sort: [{ "next_meeting.date": { order: "asc", unmapped_type: "date" } }],
    }),
  ]);

  const actionItems = actionRes.hits.hits.map((h) => ({ ...(h._source ?? {}), _id: h._id }));
  const upcomingMeetings = noteRes.hits.hits.map((h) => ({ ...(h._source ?? {}), _id: h._id }));
  return { days_ahead: daysAhead, action_items: actionItems, next_meetings: upcomingMeetings };
}

async function handleGetPursuitTeam(p: Record<string, unknown>) {
  const account = strReq(p.account, "account");
  const team = await elasticService.getPursuitTeam(account);
  if (!team) return { account, found: false };
  return { account, found: true, team };
}

async function handleListMyAccounts(p: Record<string, unknown>) {
  const userEmail = strReq(p.user_email, "user_email").toLowerCase();
  const res = await esClient.search<Record<string, unknown>>({
    index: PURSUIT_TEAM_INDEX,
    size: 200,
    query: {
      nested: {
        path: "members",
        query: { term: { "members.email": userEmail } },
      },
    } as never,
  });
  const accounts = res.hits.hits.map((h) => ({
    ...(h._source ?? {}),
    _id: h._id,
  }));
  return { user_email: userEmail, count: accounts.length, accounts };
}

function collectAttendeesFromNote(note: Record<string, unknown>, into: Set<string>) {
  const names = note.attendee_names;
  if (Array.isArray(names)) {
    for (const n of names) {
      if (typeof n === "string" && n.trim()) into.add(n.trim());
    }
  }
  const attendees = note.attendees;
  if (Array.isArray(attendees)) {
    for (const a of attendees) {
      if (a && typeof a === "object" && a !== null) {
        const o = a as Record<string, unknown>;
        const e = o.email;
        const n = o.name;
        if (typeof n === "string" && n.trim()) into.add(n.trim());
        else if (typeof e === "string" && e.trim()) into.add(e.trim().toLowerCase());
      }
    }
  }
}

async function handleListAttendeesOnAccount(p: Record<string, unknown>) {
  const account = strReq(p.account, "account");
  const { notes } = await elasticService.searchIngestedNotes({ account, size: 100, page: 1 });
  const set = new Set<string>();
  for (const n of notes) {
    if (n && typeof n === "object") collectAttendeesFromNote(n as Record<string, unknown>, set);
  }
  return { account, attendees: [...set].sort() };
}

function extractCompetitorsFromNote(note: Record<string, unknown>): string[] {
  const out: string[] = [];
  const cl = note.competitive_landscape;
  if (cl && typeof cl === "object" && cl !== null) {
    const evalList = (cl as { competitors_evaluating?: unknown }).competitors_evaluating;
    if (Array.isArray(evalList)) {
      for (const c of evalList) {
        if (typeof c === "string" && c.trim()) out.push(c.trim());
        else if (c && typeof c === "object" && "name" in c && typeof (c as { name?: unknown }).name === "string") {
          const n = (c as { name: string }).name;
          if (n.trim()) out.push(n.trim());
        }
      }
    }
  }
  return out;
}

async function handleListCompetitorsSeen(p: Record<string, unknown>) {
  const account = strReq(p.account, "account");
  const rollup = await elasticService.getAccountRollup(account);
  const fromRollup = rollup?.competitors_seen;
  if (Array.isArray(fromRollup) && fromRollup.length) {
    return { account, source: "rollup" as const, competitors: fromRollup };
  }
  const { notes } = await elasticService.searchIngestedNotes({ account, size: 30, page: 1 });
  const s = new Set<string>();
  for (const n of notes) {
    for (const c of extractCompetitorsFromNote(n as Record<string, unknown>)) s.add(c);
  }
  return { account, source: "notes" as const, competitors: [...s].sort() };
}

async function handleSearchLookups(p: Record<string, unknown>) {
  const type = strReq(p.type, "type");
  return elasticService.getLookupsByType(type);
}

const ROLLUP_DIFF_KEYS = [
  "momentum_score",
  "meeting_cadence",
  "open_action_items_count",
  "competitors_seen",
  "latest_sentiment",
  "last_meeting_date",
] as const;

function rollupValueKey(k: (typeof ROLLUP_DIFF_KEYS)[number], v: unknown): string {
  return `${k}: ${JSON.stringify(v ?? null)}`;
}

async function handleCompareTwoAccounts(p: Record<string, unknown>) {
  const a = strReq(p.account_a, "account_a");
  const b = strReq(p.account_b, "account_b");
  const [ra, rb] = await Promise.all([elasticService.getAccountRollup(a), elasticService.getAccountRollup(b)]);
  const sideA = ra ?? { account: a, missing: true as const };
  const sideB = rb ?? { account: b, missing: true as const };
  const diff: Record<string, { a: unknown; b: unknown }> = {};
  for (const k of ROLLUP_DIFF_KEYS) {
    const va = ra ? ra[k] : undefined;
    const vb = rb ? rb[k] : undefined;
    if (rollupValueKey(k, va) !== rollupValueKey(k, vb)) {
      diff[k] = { a: va, b: vb };
    }
  }
  return { account_a: sideA, account_b: sideB, diff };
}

async function handleBuildCallPrepBrief(p: Record<string, unknown>) {
  const account = strReq(p.account, "account");
  const _userEmail = str(p.user_email);
  const [team, meetings, openItems, rollup] = await Promise.all([
    elasticService.getPursuitTeam(account),
    elasticService.searchIngestedNotes({ account, size: 3, page: 1 }),
    elasticService.listActionItems({ account, status: "open", size: 50 }),
    elasticService.getAccountRollup(account),
  ]);
  const lastThree = meetings.notes;
  const technicalHighlights: string[] = [];
  for (const n of lastThree) {
    const o = n as Record<string, unknown>;
    const te = o.technical_environment;
    const kt = o.key_topics;
    const blurb = [
      typeof te === "string" ? te : undefined,
      Array.isArray(kt) ? kt.slice(0, 5).join("; ") : undefined,
    ]
      .filter(Boolean)
      .join(" | ");
    if (blurb) technicalHighlights.push(blurb);
  }
  const overdue = openItems.filter((it) => {
    const d = (it as { due_date?: string; status?: string }).due_date;
    if (!d) return false;
    return new Date(d) < new Date() && (it as { status?: string }).status === "open";
  });
  const nextMeeting =
    (rollup as { next_meeting?: unknown } | null)?.next_meeting ??
    (lastThree[0] as { next_meeting?: unknown } | undefined)?.next_meeting;
  return {
    account,
    pursuit_team: team,
    last_three_meetings: lastThree,
    technical_highlights: technicalHighlights,
    open_action_items: openItems,
    overdue_technical_action_items: overdue,
    latest_sentiment: rollup ? rollup.latest_sentiment : null,
    next_meeting: nextMeeting ?? null,
  };
}

async function handleFlagAtRiskAccounts(p: Record<string, unknown>) {
  const minStaleDays = p.min_days_stale != null ? num(p.min_days_stale, 30) : 30;
  const staleDateMath = `now-${minStaleDays}d`;
  const res = await esClient.search<Record<string, unknown>>({
    index: ROLLUPS_INDEX,
    size: 200,
    query: {
      bool: {
        should: [
          { terms: { latest_sentiment: ["concerned", "skeptical"] } },
          { range: { last_meeting_date: { lt: staleDateMath } } },
        ],
        minimum_should_match: 1,
      },
    } as never,
  });
  const accounts = res.hits.hits.map((h) => ({ ...(h._source ?? {}), _id: h._id }));
  return { min_days_stale: minStaleDays, count: accounts.length, accounts };
}

async function handleSummarizeRecentChanges(p: Record<string, unknown>) {
  const account = strReq(p.account, "account");
  const rollup = await elasticService.getAccountRollup(account);
  const res = await esClient.search<Record<string, unknown>>({
    index: NOTES_INDEX,
    size: 2,
    query: { term: { account } } as never,
    sort: [
      { updated_at: { order: "desc", missing: "_last", unmapped_type: "date" } },
      { ingested_at: { order: "desc", missing: "_last", unmapped_type: "date" } },
    ],
  });
  const recentNotes = res.hits.hits.map((h) => ({ ...(h._source ?? {}), _id: h._id }));
  return {
    account,
    rollup,
    recent_notes: recentNotes,
    summary: "Contrast rollup snapshot with the two most recent ingested/updated note documents (see field-level diff in notes' update_history when present).",
  };
}

async function handleSfdcUpdateOpportunity(p: Record<string, unknown>) {
  const opportunityId = strReq(p.opportunity_id, "opportunity_id");
  const fields: Record<string, unknown> = {};
  if (p.stage != null) fields.stage = p.stage;
  if (p.amount != null) fields.amount = p.amount;
  if (p.close_date != null) fields.close_date = p.close_date;
  return salesforceService.updateOpportunity({ opportunityId, fields });
}

async function handleSfdcLogCall(p: Record<string, unknown>, actingUser: string) {
  return salesforceService.logCall({
    opportunityId: strReq(p.opportunity_id, "opportunity_id"),
    subject: strReq(p.subject, "subject"),
    description: strReq(p.description, "description"),
    durationMinutes: typeof p.duration_minutes === "number" ? p.duration_minutes : undefined,
    actingUser,
  });
}

async function handleSfdcCreateTask(p: Record<string, unknown>, actingUser: string) {
  return salesforceService.createTask({
    opportunityId: strReq(p.opportunity_id, "opportunity_id"),
    subject: strReq(p.subject, "subject"),
    description: str(p.description),
    dueDate: str(p.due_date),
    assignedTo: strReq(p.assigned_to, "assigned_to"),
    actingUser,
  });
}

function dedupKeyForAlert(
  alertType: string,
  account: string,
  owner: string,
  message: string,
): string {
  return `${alertType}:${account}:${owner}:${crypto.createHash("sha256").update(message).digest("hex").slice(0, 16)}`;
}

async function handleCreateAlert(p: Record<string, unknown>) {
  const alertType = strReq(p.alert_type, "alert_type");
  const account = strReq(p.account, "account");
  const owner = strReq(p.owner, "owner");
  const message = strReq(p.message, "message");
  const sev = str(p.severity) ?? "medium";
  if (!["low", "medium", "high"].includes(sev)) {
    throw new TypeError("severity must be one of: low, medium, high");
  }
  return elasticService.createAlert({
    alert_type: alertType,
    account,
    owner,
    severity: sev,
    message,
    dedup_key: dedupKeyForAlert(alertType, account, owner, message),
  });
}

async function handleListMyAlerts(p: Record<string, unknown>) {
  const userEmail = strReq(p.user_email, "user_email");
  return elasticService.listAlerts(userEmail, { unreadOnly: optBool(p.unread_only) });
}

export async function handleTool(
  toolName: string,
  params: Record<string, unknown>,
  actingUser: string,
  sessionId?: string,
): Promise<unknown> {
  const input = { ...params };
  const run = (fn: () => Promise<unknown>) => wrap(toolName, input, actingUser, sessionId, fn);

  switch (toolName) {
    case "search_notes":
      return run(() => handleSearchNotes(params));
    case "semantic_search_transcripts":
      return run(() => handleSemanticSearch(params));
    case "get_note_by_id":
      return run(() => handleGetNoteById(params));
    case "get_account_brief":
      return run(() => handleGetAccountBrief(params));
    case "get_meeting_timeline":
      return run(() => handleGetMeetingTimeline(params));
    case "list_open_action_items":
      return run(() => handleListOpenActionItems(params));
    case "list_followups_due":
      return run(() => handleListFollowupsDue(params));
    case "get_pursuit_team":
      return run(() => handleGetPursuitTeam(params));
    case "list_my_accounts":
      return run(() => handleListMyAccounts(params));
    case "list_attendees_on_account":
      return run(() => handleListAttendeesOnAccount(params));
    case "list_competitors_seen":
      return run(() => handleListCompetitorsSeen(params));
    case "search_lookups":
      return run(() => handleSearchLookups(params));
    case "compare_two_accounts":
      return run(() => handleCompareTwoAccounts(params));
    case "build_call_prep_brief":
      return run(() => handleBuildCallPrepBrief(params));
    case "flag_at_risk_accounts":
      return run(() => handleFlagAtRiskAccounts(params));
    case "summarize_recent_changes":
      return run(() => handleSummarizeRecentChanges(params));
    case "sfdc_update_opportunity":
      return run(() => handleSfdcUpdateOpportunity(params));
    case "sfdc_log_call":
      return run(() => handleSfdcLogCall(params, actingUser));
    case "sfdc_create_task":
      return run(() => handleSfdcCreateTask(params, actingUser));
    case "create_alert":
      return run(() => handleCreateAlert(params));
    case "list_my_alerts":
      return run(() => handleListMyAlerts(params));
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}
