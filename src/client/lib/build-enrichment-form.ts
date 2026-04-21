import { parseActionItemsFromRaw } from "./parse-action-items.js";
import type { EnrichmentForm, NoteDetailResponse } from "../types/index.js";
import { emptyEnrichmentForm } from "../types/index.js";

export function mergeEnrichment(base: EnrichmentForm, over: Partial<EnrichmentForm>): EnrichmentForm {
  return {
    ...base,
    ...over,
    tags: over.tags ?? base.tags,
    attendees: over.attendees ?? base.attendees,
    action_items: over.action_items ?? base.action_items,
    commitments: over.commitments ?? base.commitments,
    technical_environment: { ...base.technical_environment, ...over.technical_environment },
    customer_sentiment: { ...base.customer_sentiment, ...over.customer_sentiment },
    competitive_landscape: {
      ...base.competitive_landscape,
      ...over.competitive_landscape,
      competitors_evaluating:
        over.competitive_landscape?.competitors_evaluating ??
        base.competitive_landscape.competitors_evaluating,
    },
    budget_timeline: { ...base.budget_timeline, ...over.budget_timeline },
    demo_poc_request: { ...base.demo_poc_request, ...over.demo_poc_request },
    next_meeting: {
      ...base.next_meeting,
      ...over.next_meeting,
      attendees: over.next_meeting?.attendees ?? base.next_meeting.attendees,
    },
  };
}

function s(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function arr(v: unknown): string[] {
  return Array.isArray(v) ? v.map(String) : [];
}

export function buildFormFromNoteDetail(
  detail: NoteDetailResponse,
  draft: Partial<EnrichmentForm> | null,
): EnrichmentForm {
  const f = emptyEnrichmentForm();
  const em = (detail.elastic_metadata ?? {}) as Record<string, unknown>;
  const parsed = (detail.parsed_from_summary ?? {}) as Record<string, unknown>;

  f.account = s(em.account) || f.account;
  f.opportunity = s(em.opportunity) || f.opportunity;
  f.meeting_type = s(em.meeting_type) || f.meeting_type;
  f.sales_stage = s(em.sales_stage) || f.sales_stage;
  f.meeting_purpose = s(em.meeting_purpose) || s(parsed.meeting_context_raw) || f.meeting_purpose;
  f.scheduled_by = s(em.scheduled_by) || f.scheduled_by;
  f.tags = arr(em.tags);
  if (!f.tags.length && detail.suggested_tags?.length) f.tags = [...detail.suggested_tags];

  f.key_topics = s(em.key_topics) || s(parsed.key_topics) || f.key_topics;
  f.decisions_made = s(em.decisions_made) || s(parsed.decisions_made) || f.decisions_made;
  f.open_questions = s(em.open_questions) || s(parsed.open_questions) || f.open_questions;

  const tech = em.technical_environment as Record<string, unknown> | undefined;
  const pTech = parsed.technical_environment as Record<string, unknown> | undefined;
  if (tech || pTech) {
    f.technical_environment = {
      current_stack: s(tech?.current_stack ?? pTech?.current_stack),
      pain_points: s(tech?.pain_points ?? pTech?.pain_points),
      requirements: s(tech?.requirements ?? pTech?.requirements),
      scale: s(tech?.scale ?? pTech?.scale),
      integrations: s(tech?.integrations ?? pTech?.integrations),
      constraints: s(tech?.constraints ?? pTech?.constraints),
    };
  }

  const cs = em.customer_sentiment as Record<string, unknown> | undefined;
  const pCs = parsed.customer_sentiment as Record<string, unknown> | undefined;
  if (cs || pCs) {
    f.customer_sentiment = {
      overall: s(cs?.overall ?? pCs?.overall),
      concerns: s(cs?.concerns ?? pCs?.concerns),
      objections: s(cs?.objections ?? pCs?.objections),
      champion_signals: s(cs?.champion_signals ?? pCs?.champion_signals),
    };
  }

  const cl = em.competitive_landscape as Record<string, unknown> | undefined;
  const pCl = parsed.competitive_landscape as Record<string, unknown> | undefined;
  if (cl || pCl) {
    f.competitive_landscape = {
      incumbent: s(cl?.incumbent ?? pCl?.incumbent),
      competitors_evaluating: arr(cl?.competitors_evaluating ?? pCl?.competitors_evaluating),
      mentions: s(cl?.mentions ?? pCl?.mentions),
      differentiators: s(cl?.differentiators ?? pCl?.differentiators),
    };
  }

  const bt = em.budget_timeline as Record<string, unknown> | undefined;
  const pBt = parsed.budget_timeline as Record<string, unknown> | undefined;
  if (bt || pBt) {
    f.budget_timeline = {
      budget: s(bt?.budget ?? pBt?.budget),
      timeline: s(bt?.timeline ?? pBt?.timeline),
      procurement: s(bt?.procurement ?? pBt?.procurement),
      stage_signals: s(bt?.stage_signals ?? pBt?.stage_signals),
    };
  }

  const dp = em.demo_poc_request as Record<string, unknown> | undefined;
  if (dp) {
    f.demo_poc_request = {
      description: s(dp.description),
      requirements: s(dp.requirements),
      data_available: s(dp.data_available),
      timeline: s(dp.timeline),
      success_criteria: s(dp.success_criteria),
      audience: s(dp.audience),
    };
  }

  const nm = em.next_meeting as Record<string, unknown> | undefined;
  if (nm) {
    f.next_meeting = {
      date: s(nm.date).slice(0, 10),
      agenda: s(nm.agenda),
      attendees: arr(nm.attendees),
    };
  }

  f.resources_shared = s(em.resources_shared) || f.resources_shared;
  f.resources_requested_by_customer = s(em.resources_requested_by_customer) || f.resources_requested_by_customer;
  f.resources_requested_by_us = s(em.resources_requested_by_us) || f.resources_requested_by_us;

  const att = Array.isArray(em.attendees) ? (em.attendees as EnrichmentForm["attendees"]) : [];
  if (att.length) f.attendees = att.map((a) => ({ ...a }));
  else if (detail.attendees?.length) {
    f.attendees = detail.attendees.map((a) => ({
      name: a.name ?? "",
      email: a.email,
      title: "",
      company: "",
      role_flag: "none",
    }));
  }

  const ai = em.action_items as EnrichmentForm["action_items"] | undefined;
  if (ai?.length) f.action_items = ai.map((x) => ({ ...x }));
  else {
    const raw = s(parsed.action_items_raw);
    if (raw) f.action_items = parseActionItemsFromRaw(raw);
  }

  const cm = em.commitments as EnrichmentForm["commitments"] | undefined;
  if (cm?.length) f.commitments = cm.map((x) => ({ ...x }));

  if (draft && Object.keys(draft).length) {
    return mergeEnrichment(f, draft);
  }
  return f;
}

export function buildFormFromElasticDoc(doc: Record<string, unknown>): EnrichmentForm {
  const fake: NoteDetailResponse = {
    id: String(doc.note_id ?? ""),
    title: doc.title == null ? null : String(doc.title),
    created_at: String(doc.meeting_date ?? ""),
    updated_at: String(doc.updated_at ?? ""),
    owner: { name: null, email: String(doc.author_email ?? "") },
    attendees: [],
    summary_text: String(doc.summary ?? ""),
    summary_markdown: null,
    transcript: doc.transcript == null ? null : String(doc.transcript),
    suggested_tags: [],
    elastic_metadata: doc,
  };
  return buildFormFromNoteDetail(fake, null);
}
