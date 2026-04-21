import { Client, errors } from "@elastic/elasticsearch";
import { createElasticsearchClientFromEnv } from "../config/elastic-client.js";
import {
  LOOKUPS_INDEX,
  NOTES_INDEX,
  NOTES_PIPELINE,
  SYNC_STATE_INDEX,
} from "../constants/elastic.js";
import type { IngestNoteInput } from "../types/ingest-note.js";

export interface IngestedNoteSearchFilters {
  account?: string;
  opportunity?: string;
  author?: string;
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
      summary: note.summary ?? undefined,
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
    const size = Math.min(100, Math.max(1, filters.size ?? 20));
    const from = (page - 1) * size;

    const must: object[] = [];
    const filter: object[] = [];

    if (filters.account) filter.push({ term: { account: filters.account } });
    if (filters.opportunity) filter.push({ term: { opportunity: filters.opportunity } });
    if (filters.author) filter.push({ term: { author_email: filters.author } });
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
}
