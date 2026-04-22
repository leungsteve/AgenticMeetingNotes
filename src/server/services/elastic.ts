import { Client, errors, type estypes } from "@elastic/elasticsearch";
import { createElasticsearchClientFromEnv } from "../config/elastic-client.js";
import {
  ACTION_ITEMS_INDEX,
  AGENT_ACTIONS_INDEX,
  AGENT_ALERTS_INDEX,
  AGENT_FEEDBACK_INDEX,
  LOOKUPS_INDEX,
  NOTES_INDEX,
  NOTES_PIPELINE,
  PURSUIT_TEAM_INDEX,
  ROLLUPS_INDEX,
  SYNC_STATE_INDEX,
} from "../constants/elastic.js";
import type { IngestNoteInput } from "../types/ingest-note.js";

export interface IngestedNoteSearchFilters {
  account?: string;
  opportunity?: string;
  author?: string;
  author_role?: string;
  meeting_type?: string;
  tags?: string | string[];
  sales_stage?: string;
  from?: string;
  to?: string;
  q?: string;
  page?: number;
  size?: number;
}

export interface SyncStateDocument {
  user_email: string;
  user_name?: string;
  user_role?: string;
  granola_api_key?: string;
  last_fetched_at?: string;
  last_fetched_cursor?: string;
  total_notes_fetched?: number;
  total_notes_ingested?: number;
}

export interface LookupDocument {
  type: string;
  value: string;
  label: string;
  metadata?: Record<string, unknown>;
}

function attendeeEmails(attendees: IngestNoteInput["attendees"]): string[] {
  const set = new Set<string>();
  for (const a of attendees ?? []) {
    const e = typeof a?.email === "string" ? a.email.trim().toLowerCase() : "";
    if (e) set.add(e);
  }
  return [...set];
}

function summarizeChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  keys: string[],
): string {
  const changed: string[] = [];
  for (const k of keys) {
    const b = JSON.stringify(before[k] ?? null);
    const a = JSON.stringify(after[k] ?? null);
    if (b !== a) changed.push(k);
  }
  return changed.length ? changed.join(", ") : "metadata refresh (no scalar diff)";
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out = { ...obj };
  for (const k of Object.keys(out)) {
    if (out[k] === undefined) delete out[k];
  }
  return out as T;
}

function mergeKeywordTags(...sources: unknown[]): string[] | undefined {
  const set = new Set<string>();
  for (const src of sources) {
    if (!Array.isArray(src)) continue;
    for (const t of src) {
      if (typeof t === "string" && t.trim()) set.add(t.trim());
    }
  }
  return set.size ? [...set] : undefined;
}

export class ElasticService {
  constructor(private readonly client: Client = createElasticsearchClientFromEnv()) {}

  async ping(): Promise<boolean> {
    return this.client.ping();
  }

  async documentExists(noteId: string): Promise<boolean> {
    return this.client.exists({ index: NOTES_INDEX, id: noteId });
  }

  async getIngestedNote(noteId: string): Promise<Record<string, unknown> | null> {
    try {
      const res = await this.client.get<{ _source: Record<string, unknown> }>({
        index: NOTES_INDEX,
        id: noteId,
      });
      return res._source ?? null;
    } catch (e) {
      if (e instanceof errors.ResponseError && e.meta.statusCode === 404) return null;
      throw e;
    }
  }

  private async getIngestedNoteWithSeq(noteId: string): Promise<{
    source: Record<string, unknown>;
    seqNo: number;
    primaryTerm: number;
  } | null> {
    try {
      const res = await this.client.get({
        index: NOTES_INDEX,
        id: noteId,
      });
      if (!res._source) return null;
      if (res._seq_no == null || res._primary_term == null) return null;
      return { source: res._source as Record<string, unknown>, seqNo: res._seq_no, primaryTerm: res._primary_term };
    } catch (e) {
      if (e instanceof errors.ResponseError && e.meta.statusCode === 404) return null;
      throw e;
    }
  }

  /**
   * Index or replace a note document, running the ingest pipeline. Handles version + update_history on re-ingest.
   */
  async indexNote(
    note: IngestNoteInput,
    options?: { updatedBy?: string; conflictRetries?: number },
  ): Promise<{ outcome: "created" | "updated"; version: number }> {
    const conflictRetries = options?.conflictRetries ?? 1;
    const tryOnce = async (attempt: number): Promise<{ outcome: "created" | "updated"; version: number }> => {
      const existing = await this.getIngestedNoteWithSeq(note.note_id);
      const incoming = this.buildSourceFromInput(note);

      const metaKeys = [
        "account",
        "opportunity",
        "meeting_type",
        "sales_stage",
        "tags",
        "meeting_purpose",
        "title",
        "summary",
      ];

      if (!existing) {
        const doc = stripUndefined({
          ...incoming,
          note_id: note.note_id,
          version: 1,
          update_history: [],
        } as Record<string, unknown>);
        await this.client.index({
          index: NOTES_INDEX,
          id: note.note_id,
          document: doc,
          pipeline: NOTES_PIPELINE,
          refresh: "wait_for",
        });
        return { outcome: "created", version: 1 };
      }

      const merged: Record<string, unknown> = {
        ...existing.source,
        ...incoming,
        note_id: note.note_id,
        version: Number(existing.source.version ?? 1) + 1,
      };

      const changes = summarizeChanges(existing.source, merged, metaKeys);
      const prevHistory = Array.isArray(existing.source.update_history)
        ? (existing.source.update_history as unknown[])
        : [];
      merged.update_history = [
        ...prevHistory,
        {
          updated_at: new Date().toISOString(),
          updated_by: options?.updatedBy ?? note.author_email ?? "unknown",
          changes,
        },
      ];
      merged.updated_at = new Date().toISOString();
      const mergedTags = mergeKeywordTags(existing.source.tags, note.tags);
      if (mergedTags?.length) merged.tags = mergedTags;

      try {
        await this.client.index({
          index: NOTES_INDEX,
          id: note.note_id,
          document: merged,
          pipeline: NOTES_PIPELINE,
          if_seq_no: existing.seqNo,
          if_primary_term: existing.primaryTerm,
          refresh: "wait_for",
        });
      } catch (e) {
        if (
          e instanceof errors.ResponseError &&
          e.meta.statusCode === 409 &&
          attempt < conflictRetries
        ) {
          return tryOnce(attempt + 1);
        }
        throw e;
      }
      return { outcome: "updated", version: Number(merged.version) };
    };

    return tryOnce(0);
  }

  private buildSourceFromInput(note: IngestNoteInput): Record<string, unknown> {
    const attendee_names = attendeeEmails(note.attendees);
    const body: Record<string, unknown> = {
      meeting_group_id: note.meeting_group_id ?? undefined,
      account: note.account ?? undefined,
      opportunity: note.opportunity ?? undefined,
      team: note.team ?? undefined,
      author_email: note.author_email ?? undefined,
      author_name: note.author_name ?? undefined,
      author_role: note.author_role ?? undefined,
      attendees: note.attendees?.length ? note.attendees : undefined,
      attendee_names: attendee_names.length ? attendee_names : undefined,
      meeting_date: note.meeting_date ?? undefined,
      ingested_by: note.ingested_by ?? undefined,
      meeting_purpose: note.meeting_purpose ?? undefined,
      scheduled_by: note.scheduled_by ?? undefined,
      title: note.title ?? undefined,
      summary:
        note.summary != null && String(note.summary).trim() !== ""
          ? String(note.summary).trim()
          : undefined,
      transcript: note.transcript ?? undefined,
      key_topics: note.key_topics ?? undefined,
      decisions_made: note.decisions_made ?? undefined,
      open_questions: note.open_questions ?? undefined,
      technical_environment: note.technical_environment ?? undefined,
      action_items: note.action_items?.length ? note.action_items : undefined,
      commitments: note.commitments?.length ? note.commitments : undefined,
      customer_sentiment: note.customer_sentiment ?? undefined,
      competitive_landscape: note.competitive_landscape
        ? {
            ...note.competitive_landscape,
            competitors_evaluating: note.competitive_landscape.competitors_evaluating?.length
              ? note.competitive_landscape.competitors_evaluating
              : undefined,
          }
        : undefined,
      budget_timeline: note.budget_timeline ?? undefined,
      demo_poc_request: note.demo_poc_request ?? undefined,
      resources_shared: note.resources_shared ?? undefined,
      resources_requested_by_customer: note.resources_requested_by_customer ?? undefined,
      resources_requested_by_us: note.resources_requested_by_us ?? undefined,
      next_meeting: note.next_meeting ?? undefined,
      tags: note.tags?.length ? note.tags : undefined,
      meeting_type: note.meeting_type ?? undefined,
      sales_stage: note.sales_stage ?? undefined,
      local_file_path: note.local_file_path ?? undefined,
    };
    return stripUndefined(body);
  }

  async searchIngestedNotes(filters: IngestedNoteSearchFilters): Promise<{
    total: number;
    page: number;
    size: number;
    notes: Record<string, unknown>[];
  }> {
    const page = Math.max(1, filters.page ?? 1);
    const size = Math.min(1000, Math.max(1, filters.size ?? 20));
    const from = (page - 1) * size;

    const must: object[] = [];
    const filter: object[] = [];

    if (filters.account) filter.push({ term: { account: filters.account } });
    if (filters.opportunity) filter.push({ term: { opportunity: filters.opportunity } });
    if (filters.author) filter.push({ term: { author_email: filters.author } });
    if (filters.author_role) filter.push({ term: { author_role: filters.author_role } });
    if (filters.meeting_type) filter.push({ term: { meeting_type: filters.meeting_type } });
    if (filters.sales_stage) filter.push({ term: { sales_stage: filters.sales_stage } });
    const tags = filters.tags
      ? Array.isArray(filters.tags)
        ? filters.tags
        : [filters.tags]
      : [];
    for (const t of tags) {
      if (t) filter.push({ term: { tags: t } });
    }
    if (filters.from || filters.to) {
      filter.push({
        range: {
          meeting_date: {
            ...(filters.from ? { gte: filters.from } : {}),
            ...(filters.to ? { lte: filters.to } : {}),
          },
        },
      });
    }
    if (filters.q?.trim()) {
      must.push({
        multi_match: {
          query: filters.q.trim(),
          type: "best_fields",
          fields: ["title^2", "summary"],
        },
      });
    }

    const boolMust: object[] = must.length ? must : [{ match_all: {} }];
    const query =
      must.length || filter.length
        ? {
            bool: {
              must: boolMust,
              ...(filter.length ? { filter } : {}),
            },
          }
        : { match_all: {} };

    const res = await this.client.search<Record<string, unknown>>({
      index: NOTES_INDEX,
      from,
      size,
      sort: [{ meeting_date: { order: "desc", missing: "_last", unmapped_type: "date" } }],
      track_total_hits: true,
      query: query as never,
    });

    const total =
      typeof res.hits.total === "number" ? res.hits.total : (res.hits.total?.value ?? 0);
    const notes = res.hits.hits.map((h) => ({ ...(h._source as object), _id: h._id }));
    return { total, page, size, notes };
  }

  async getIngestedNoteIds(): Promise<string[]> {
    const res = await this.client.search<{ note_id?: string }>({
      index: NOTES_INDEX,
      size: 10000,
      _source: ["note_id"],
      query: { match_all: {} },
    });
    const ids: string[] = [];
    for (const h of res.hits.hits) {
      const id = h._source?.note_id;
      if (typeof id === "string") ids.push(id);
    }
    return ids;
  }

  /**
   * Notes within ±15 minutes of `meetingDate` that share at least one attendee email.
   */
  async findRelatedNotes(
    meetingDateIso: string,
    attendeeEmailsList: string[],
    excludeNoteId?: string,
  ): Promise<Array<Record<string, unknown> & { note_id?: string }>> {
    const center = new Date(meetingDateIso);
    if (Number.isNaN(center.getTime())) return [];
    const start = new Date(center.getTime() - 15 * 60 * 1000).toISOString();
    const end = new Date(center.getTime() + 15 * 60 * 1000).toISOString();
    const emails = [...new Set(attendeeEmailsList.map((e) => e.trim().toLowerCase()).filter(Boolean))];
    if (!emails.length) return [];

    const must: object[] = [
      { range: { meeting_date: { gte: start, lte: end } } },
      {
        bool: {
          should: [
            { terms: { attendee_names: emails } },
            {
              nested: {
                path: "attendees",
                query: { terms: { "attendees.email": emails } },
              },
            },
          ],
          minimum_should_match: 1,
        },
      },
    ];
    const mustNot = excludeNoteId ? [{ term: { note_id: excludeNoteId } }] : [];

    const res = await this.client.search<Record<string, unknown>>({
      index: NOTES_INDEX,
      size: 50,
      query: { bool: { must, ...(mustNot.length ? { must_not: mustNot } : {}) } } as never,
    });
    return res.hits.hits.map((h) => ({ ...(h._source ?? {}), _id: h._id }));
  }

  async getSyncStateByEmail(email: string): Promise<SyncStateDocument | null> {
    const res = await this.client.search<SyncStateDocument>({
      index: SYNC_STATE_INDEX,
      size: 1,
      query: { term: { user_email: email.toLowerCase() } },
    });
    const src = res.hits.hits[0]?._source;
    return src ?? null;
  }

  async listSyncStates(): Promise<SyncStateDocument[]> {
    const res = await this.client.search<SyncStateDocument>({
      index: SYNC_STATE_INDEX,
      size: 500,
      query: { match_all: {} },
    });
    return res.hits.hits.map((h) => h._source!).filter(Boolean);
  }

  async upsertSyncState(doc: SyncStateDocument): Promise<void> {
    const id = doc.user_email.toLowerCase().replace(/[^a-z0-9]+/g, "_");
    await this.client.index({
      index: SYNC_STATE_INDEX,
      id,
      document: { ...doc, user_email: doc.user_email.toLowerCase() },
      refresh: "wait_for",
    });
  }

  async incrementNotesIngested(userEmail: string, delta: number): Promise<void> {
    const cur = await this.getSyncStateByEmail(userEmail);
    if (!cur) return;
    const next = Math.max(0, (cur.total_notes_ingested ?? 0) + delta);
    await this.upsertSyncState({ ...cur, total_notes_ingested: next });
  }

  async getLookupsByType(type: string): Promise<LookupDocument[]> {
    const res = await this.client.search<LookupDocument>({
      index: LOOKUPS_INDEX,
      size: 2000,
      query: { term: { type } },
      sort: [{ value: "asc" }],
    });
    return res.hits.hits.map((h) => h._source!).filter(Boolean);
  }

  async addLookup(doc: LookupDocument): Promise<void> {
    await this.client.index({
      index: LOOKUPS_INDEX,
      document: doc,
      refresh: "wait_for",
    });
  }

  async mGetIngestedNotesByIds(ids: string[]): Promise<Map<string, Record<string, unknown>>> {
    const uniq = [...new Set(ids)].filter(Boolean);
    if (!uniq.length) return new Map();
    const res = await this.client.mget({
      index: NOTES_INDEX,
      ids: uniq,
    });
    const map = new Map<string, Record<string, unknown>>();
    for (const d of res.docs) {
      if ("found" in d && d.found === true && d._source) {
        map.set(String(d._id), d._source as Record<string, unknown>);
      }
    }
    return map;
  }

  async patchLocalFilePath(noteId: string, localFilePath: string): Promise<void> {
    await this.client.update({
      index: NOTES_INDEX,
      id: noteId,
      doc: { local_file_path: localFilePath },
      refresh: "wait_for",
    });
  }

  async countMeetingNotes(): Promise<number> {
    const res = await this.client.count({ index: NOTES_INDEX });
    return res.count;
  }

  async recentIngestions(limit = 10): Promise<Record<string, unknown>[]> {
    const res = await this.client.search<Record<string, unknown>>({
      index: NOTES_INDEX,
      size: limit,
      sort: [{ ingested_at: { order: "desc", missing: "_last", unmapped_type: "date" } }],
      query: { match_all: {} },
    });
    return res.hits.hits.map((h) => ({ ...(h._source ?? {}), _id: h._id }));
  }

  // --- Hybrid Search (RRF over BM25 + kNN with Jina reranker) ---

  private mapHybridHits(
    res: estypes.SearchResponse<Record<string, unknown>>,
  ): Array<Record<string, unknown> & { _id: string; _score: number }> {
    return res.hits.hits.map((h) => ({
      ...(h._source as Record<string, unknown>),
      _id: String(h._id),
      _score: typeof h._score === "number" ? h._score : 0,
    }));
  }

  private async hybridSearchWithRetriever(
    query: string,
    params: {
      account?: string;
      size: number;
      knnField: string;
      textFields: string[];
      useKnn: boolean;
      knnModelId: string;
      useRerank: boolean;
    },
  ): Promise<Array<Record<string, unknown> & { _id: string; _score: number }>> {
    const accountFilter = params.account
      ? { term: { account: params.account } }
      : undefined;
    const mustQuery = {
      multi_match: {
        query: query.trim(),
        type: "best_fields" as const,
        fields: params.textFields,
      },
    };
    const stdQuery = accountFilter
      ? { bool: { must: [mustQuery], filter: [accountFilter] } }
      : mustQuery;

    const standard: estypes.StandardRetriever = {
      query: stdQuery as estypes.QueryDslQueryContainer,
    };

    const retrievers: estypes.RetrieverContainer[] = [{ standard }];
    if (params.useKnn) {
      retrievers.push({
        knn: {
          field: params.knnField,
          k: 20,
          num_candidates: 100,
          query_vector_builder: {
            text_embedding: {
              model_id: params.knnModelId,
              model_text: query.trim(),
            },
          },
          ...(accountFilter ? { filter: accountFilter } : {}),
        },
      });
    }

    const rrf: estypes.RetrieverContainer = {
      rrf: {
        retrievers,
        rank_window_size: 100,
      },
    };

    const inner: estypes.RetrieverContainer = params.useRerank
      ? {
          text_similarity_reranker: {
            retriever: rrf,
            rank_window_size: 20,
            inference_id: ".jina-reranker-v2-base-multilingual",
            inference_text: query.trim(),
            field: "summary",
          },
        }
      : rrf;

    const res = await this.client.search<Record<string, unknown>>({
      index: NOTES_INDEX,
      size: params.size,
      ignore_unavailable: true,
      allow_partial_search_results: true,
      retriever: inner as never,
    });
    return this.mapHybridHits(res);
  }

  private async hybridSearchMultiMatch(
    query: string,
    account: string | undefined,
    size: number,
    textFields: string[],
  ): Promise<Array<Record<string, unknown> & { _id: string; _score: number }>> {
    const mustQuery = {
      multi_match: {
        query: query.trim(),
        type: "best_fields" as const,
        fields: textFields,
      },
    };
    const qy = account
      ? { bool: { must: [mustQuery], filter: [{ term: { account } }] } }
      : mustQuery;
    const res = await this.client.search<Record<string, unknown>>({
      index: NOTES_INDEX,
      size,
      ignore_unavailable: true,
      allow_partial_search_results: true,
      query: qy as never,
    });
    return this.mapHybridHits(res);
  }

  async hybridSearch(
    query: string,
    options?: {
      account?: string;
      size?: number;
      knnField?: string;
      textFields?: string[];
    },
  ): Promise<Array<Record<string, unknown> & { _id: string; _score: number }>> {
    const q = query?.trim() ?? "";
    if (!q) return [];

    const size = options?.size ?? 10;
    const knnField = options?.knnField ?? "summary_embedding";
    const textFields = options?.textFields ?? [
      "title^3",
      "summary^2",
      "transcript",
      "key_topics",
    ];
    const account = options?.account;
    const knnModels: string[] = [".jina-embeddings-v3", ".multilingual-e5-small-elasticsearch"];

    for (const knnModelId of knnModels) {
      try {
        return await this.hybridSearchWithRetriever(q, {
          account,
          size,
          knnField,
          textFields,
          useKnn: true,
          knnModelId,
          useRerank: true,
        });
      } catch {
        // try next fallback
      }
    }

    try {
      return await this.hybridSearchWithRetriever(q, {
        account,
        size,
        knnField,
        textFields,
        useKnn: false,
        knnModelId: ".jina-embeddings-v3",
          useRerank: true,
      });
    } catch {
      // continue
    }

    try {
      return await this.hybridSearchWithRetriever(q, {
        account,
        size,
        knnField,
        textFields,
        useKnn: false,
        knnModelId: ".jina-embeddings-v3",
        useRerank: false,
      });
    } catch {
      // continue
    }

    return this.hybridSearchMultiMatch(q, account, size, textFields);
  }

  // --- Rollups ---

  async getAccountRollup(account: string): Promise<Record<string, unknown> | null> {
    try {
      const res = await this.client.get<{ _source: Record<string, unknown> }>({
        index: ROLLUPS_INDEX,
        id: account,
      });
      return res._source ?? null;
    } catch (e) {
      if (e instanceof errors.ResponseError && e.meta.statusCode === 404) return null;
      throw e;
    }
  }

  /**
   * List rollup documents for the account-rollups index (e.g. Accounts UI and rollups API).
   */
  async listAccountRollups(): Promise<Array<Record<string, unknown>>> {
    const res = await this.client.search<Record<string, unknown>>({
      index: ROLLUPS_INDEX,
      size: 500,
      query: { match_all: {} },
      sort: [{ last_meeting_date: { order: "desc", missing: "_last", unmapped_type: "date" } }],
    });
    return res.hits.hits.map((h) => (h._source as Record<string, unknown>) ?? {});
  }

  async upsertAccountRollup(account: string, data: Record<string, unknown>): Promise<void> {
    await this.client.index({
      index: ROLLUPS_INDEX,
      id: account,
      document: { ...data, account },
      refresh: "wait_for",
    });
  }

  // --- Pursuit Team ---

  async getPursuitTeam(account: string): Promise<Record<string, unknown> | null> {
    try {
      const res = await this.client.get<{ _source: Record<string, unknown> }>({
        index: PURSUIT_TEAM_INDEX,
        id: account,
      });
      return res._source ?? null;
    } catch (e) {
      if (e instanceof errors.ResponseError && e.meta.statusCode === 404) return null;
      throw e;
    }
  }

  async upsertPursuitTeam(account: string, data: Record<string, unknown>): Promise<void> {
    await this.client.index({
      index: PURSUIT_TEAM_INDEX,
      id: account,
      document: { ...data, account },
      refresh: "wait_for",
    });
  }

  async listPursuitTeams(): Promise<Array<Record<string, unknown>>> {
    const res = await this.client.search<Record<string, unknown>>({
      index: PURSUIT_TEAM_INDEX,
      size: 500,
      query: { match_all: {} },
    });
    return res.hits.hits.map((h) => (h._source as Record<string, unknown>) ?? {});
  }

  // --- Action Items ---

  async listActionItems(filters?: {
    account?: string;
    owner?: string;
    status?: string;
    overdue?: boolean;
    size?: number;
  }): Promise<Array<Record<string, unknown>>> {
    const filter: object[] = [];
    if (filters?.account) filter.push({ term: { account: filters.account } });
    if (filters?.owner) filter.push({ term: { owner: filters.owner } });
    if (filters?.status) filter.push({ term: { status: filters.status } });
    if (filters?.overdue) {
      filter.push({ range: { due_date: { lt: new Date().toISOString() } } });
      filter.push({ term: { status: "open" } });
    }
    const bool =
      filter.length > 0 ? { bool: { filter } } : { match_all: {} };
    const res = await this.client.search<Record<string, unknown>>({
      index: ACTION_ITEMS_INDEX,
      size: Math.min(500, Math.max(1, filters?.size ?? 100)),
      query: bool as never,
      sort: [{ due_date: { order: "asc", missing: "_last", unmapped_type: "date" } }],
    });
    return res.hits.hits.map((h) => ({
      ...((h._source as Record<string, unknown>) ?? {}),
      _id: h._id,
    }));
  }

  async upsertActionItem(id: string, doc: Record<string, unknown>): Promise<void> {
    await this.client.index({
      index: ACTION_ITEMS_INDEX,
      id,
      document: doc,
      refresh: "wait_for",
    });
  }

  async bulkUpsertActionItems(
    items: Array<{ id: string; doc: Record<string, unknown> }>,
  ): Promise<void> {
    if (!items.length) return;
    const operations: object[] = [];
    for (const { id, doc } of items) {
      operations.push({ index: { _index: ACTION_ITEMS_INDEX, _id: id } });
      operations.push(doc);
    }
    const res = await this.client.bulk({ refresh: false, operations: operations as never });
    if (res.errors) {
      const failed = res.items.find((i) => i.index?.error || i.create?.error);
      throw new Error(
        `Bulk upsert had failures: ${JSON.stringify(failed?.index?.error ?? failed?.create?.error)}`,
      );
    }
  }

  // --- Agent Actions (audit log) ---

  logAgentAction(doc: {
    tool_name: string;
    acting_user: string;
    input: Record<string, unknown>;
    output_summary: string;
    latency_ms: number;
    session_id?: string;
  }): Promise<void> {
    void this.client
      .index({
        index: AGENT_ACTIONS_INDEX,
        document: {
          ...doc,
          created_at: new Date().toISOString(),
        },
        refresh: false,
      })
      .catch(() => {});
    return Promise.resolve();
  }

  /**
   * Search agent action audit log (e.g. SFDC outbound view).
   */
  async searchAgentActions(filters: {
    toolNamePrefix?: string;
    toolNameTerm?: string;
    actingUser?: string;
    createdFrom?: string;
    createdTo?: string;
    size?: number;
  }): Promise<Array<Record<string, unknown> & { _id: string }>> {
    const filter: object[] = [];
    if (filters.toolNameTerm) {
      filter.push({ term: { tool_name: filters.toolNameTerm } });
    } else if (filters.toolNamePrefix) {
      filter.push({ prefix: { tool_name: filters.toolNamePrefix } });
    }
    if (filters.actingUser) {
      filter.push({ term: { acting_user: filters.actingUser } });
    }
    if (filters.createdFrom || filters.createdTo) {
      const range: { gte?: string; lte?: string } = {};
      if (filters.createdFrom) range.gte = filters.createdFrom;
      if (filters.createdTo) range.lte = filters.createdTo;
      filter.push({ range: { created_at: range } });
    }
    const query = filter.length > 0 ? { bool: { filter } } : { match_all: {} };
    const res = await this.client.search<Record<string, unknown>>({
      index: AGENT_ACTIONS_INDEX,
      size: Math.min(200, Math.max(1, filters.size ?? 50)),
      query: query as never,
      sort: [{ created_at: { order: "desc" } }],
    });
    return res.hits.hits.map((h) => {
      const src = h._source ?? {};
      return { ...src, _id: h._id ?? "" } as Record<string, unknown> & { _id: string };
    });
  }

  // --- Agent Alerts ---

  async createAlert(doc: {
    alert_type: string;
    account: string;
    owner: string;
    severity: string;
    message: string;
    metadata?: Record<string, unknown>;
    dedup_key: string;
  }): Promise<{ created: boolean }> {
    const existing = await this.client.count({
      index: AGENT_ALERTS_INDEX,
      query: { term: { dedup_key: doc.dedup_key } } as never,
    });
    if (existing.count > 0) return { created: false };

    await this.client.index({
      index: AGENT_ALERTS_INDEX,
      document: {
        ...doc,
        read: false,
        created_at: new Date().toISOString(),
      },
      refresh: "wait_for",
    });
    return { created: true };
  }

  async listAlerts(
    owner: string,
    options?: { unreadOnly?: boolean; size?: number },
  ): Promise<Array<Record<string, unknown>>> {
    const filter: object[] = [{ term: { owner } }];
    if (options?.unreadOnly) filter.push({ term: { read: false } });
    const res = await this.client.search<Record<string, unknown>>({
      index: AGENT_ALERTS_INDEX,
      size: Math.min(200, Math.max(1, options?.size ?? 50)),
      query: { bool: { filter } } as never,
      sort: [{ created_at: { order: "desc", missing: "_last", unmapped_type: "date" } }],
    });
    return res.hits.hits.map((h) => ({
      ...(h._source as object),
      _id: h._id,
    })) as Array<Record<string, unknown>>;
  }

  async markAlertRead(alertId: string): Promise<void> {
    await this.client.update({
      index: AGENT_ALERTS_INDEX,
      id: alertId,
      doc: { read: true } as never,
      refresh: "wait_for",
    });
  }

  // --- Agent Feedback ---

  async saveFeedback(doc: {
    session_id: string;
    message_id: string;
    rating: number;
    comment?: string;
    tool_calls?: unknown;
    acting_user: string;
  }): Promise<void> {
    await this.client.index({
      index: AGENT_FEEDBACK_INDEX,
      document: {
        ...doc,
        created_at: new Date().toISOString(),
      },
      refresh: "wait_for",
    });
  }
}
