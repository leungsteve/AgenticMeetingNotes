import type {
  BudgetTimelineInput,
  CompetitiveLandscapeInput,
  IngestNoteInput,
} from "../types/ingest-note.js";
import { ElasticService } from "./elastic.js";

/**
 * Mirrors the ingest pipeline auto-tag rules (PROJECT_BRIEF) for UI preview.
 */
export function suggestTags(
  summary: string | null | undefined,
  extras?: {
    key_topics?: string | null;
    decisions_made?: string | null;
    budget_timeline?: BudgetTimelineInput | null;
    competitive_landscape?: CompetitiveLandscapeInput | null;
    technical_environment?: IngestNoteInput["technical_environment"];
    customer_sentiment?: IngestNoteInput["customer_sentiment"];
    commitments?: IngestNoteInput["commitments"];
    demo_poc_request?: IngestNoteInput["demo_poc_request"];
    open_questions?: string | null;
    next_meeting?: IngestNoteInput["next_meeting"];
  },
): string[] {
  const s =
    `${summary ?? ""} ${extras?.key_topics ?? ""} ${extras?.decisions_made ?? ""}`.toLowerCase();
  const autoTags = new Set<string>();

  if (s.includes("demo") || s.includes("proof of concept") || s.includes("poc"))
    autoTags.add("demo-request");
  if (
    s.includes("pricing") ||
    s.includes("cost") ||
    s.includes("budget") ||
    s.includes("license") ||
    (extras?.budget_timeline?.budget != null && String(extras.budget_timeline.budget).length > 0)
  ) {
    autoTags.add("pricing");
  }
  if (
    s.includes("security") ||
    s.includes("compliance") ||
    s.includes("soc2") ||
    s.includes("fedramp") ||
    s.includes("hipaa") ||
    s.includes("gdpr") ||
    s.includes("pci")
  ) {
    autoTags.add("security");
  }
  if (
    s.includes("competitor") ||
    s.includes("splunk") ||
    s.includes("datadog") ||
    s.includes("opensearch") ||
    s.includes("sumo logic") ||
    s.includes("new relic") ||
    s.includes("dynatrace") ||
    (extras?.competitive_landscape?.competitors_evaluating?.length ?? 0) > 0
  ) {
    autoTags.add("competitive");
  }
  if (
    s.includes("deadline") ||
    s.includes("timeline") ||
    s.includes("by end of") ||
    s.includes("go-live") ||
    s.includes("renewal") ||
    (extras?.budget_timeline?.timeline != null &&
      String(extras.budget_timeline.timeline).length > 0)
  ) {
    autoTags.add("timeline");
  }
  if (
    s.includes("blocker") ||
    s.includes("escalat") ||
    s.includes("urgent") ||
    s.includes("critical")
  ) {
    autoTags.add("escalation");
  }
  if (
    s.includes("migration") ||
    s.includes("migrate") ||
    s.includes("cut-over") ||
    s.includes("cutover")
  ) {
    autoTags.add("migration");
  }
  if (
    s.includes("architecture") ||
    s.includes("design review") ||
    s.includes("technical deep") ||
    (extras?.technical_environment?.current_stack != null &&
      String(extras.technical_environment.current_stack).length > 0)
  ) {
    autoTags.add("technical");
  }
  if (
    extras?.customer_sentiment?.objections != null &&
    String(extras.customer_sentiment.objections).length > 0
  ) {
    autoTags.add("has-objections");
  }
  if (extras?.commitments?.length) autoTags.add("has-commitments");
  if (
    extras?.demo_poc_request?.description != null &&
    String(extras.demo_poc_request.description).length > 0
  ) {
    autoTags.add("demo-request");
  }
  if ((extras?.open_questions?.length ?? 0) > 10) autoTags.add("has-open-questions");
  if (extras?.next_meeting?.date != null && String(extras.next_meeting.date).length > 0) {
    autoTags.add("follow-up-scheduled");
  }

  return [...autoTags];
}

export async function detectDuplicate(elastic: ElasticService, noteId: string): Promise<boolean> {
  return elastic.documentExists(noteId);
}

export async function findMeetingGroup(
  elastic: ElasticService,
  meetingDateIso: string,
  attendeeEmails: string[],
  excludeNoteId?: string,
): Promise<{
  related: Array<Record<string, unknown> & { note_id?: string }>;
  suggestedGroupId: string | null;
}> {
  const related = await elastic.findRelatedNotes(meetingDateIso, attendeeEmails, excludeNoteId);
  const existingGroup = related
    .map((r) => r.meeting_group_id)
    .find((g) => typeof g === "string" && g.length > 0) as string | undefined;
  return {
    related,
    suggestedGroupId: existingGroup ?? null,
  };
}
