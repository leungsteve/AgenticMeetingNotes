import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import { errors } from "@elastic/elasticsearch";
import { getElastic } from "../elastic-instance.js";
import { findMeetingGroup } from "../services/enrichment.js";
import { writeNoteToFile } from "../services/file-writer.js";
import type { IngestNoteInput } from "../types/ingest-note.js";
import type { NoteFilePayload } from "../types/file-note.js";

const router = Router();

interface IngestNoteResult {
  success: boolean;
  action: "created" | "updated" | "error";
  version: number;
  elastic_doc_id?: string;
  local_file_path?: string;
  error?: string;
}

function optStr(v: unknown): string | null | undefined {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s.length ? s : null;
}

function rowToIngestInput(r: Record<string, unknown>): IngestNoteInput {
  const note_id = String(r.granola_note_id ?? r.note_id ?? "").trim();
  if (!note_id) {
    throw new Error("granola_note_id is required for each note");
  }
  return {
    note_id,
    meeting_group_id: optStr(r.meeting_group_id),
    account: optStr(r.account),
    opportunity: optStr(r.opportunity),
    team: optStr(r.team),
    author_email: optStr(r.author_email),
    author_name: optStr(r.author_name),
    author_role: optStr(r.author_role),
    attendees: Array.isArray(r.attendees)
      ? (r.attendees as IngestNoteInput["attendees"])
      : undefined,
    meeting_date: optStr(r.meeting_date),
    meeting_purpose: optStr(r.meeting_purpose),
    scheduled_by: optStr(r.scheduled_by),
    title: optStr(r.title),
    summary: optStr(r.summary),
    transcript: optStr(r.transcript),
    key_topics: optStr(r.key_topics),
    decisions_made: optStr(r.decisions_made),
    open_questions: optStr(r.open_questions),
    technical_environment:
      r.technical_environment && typeof r.technical_environment === "object"
        ? (r.technical_environment as IngestNoteInput["technical_environment"])
        : undefined,
    action_items: Array.isArray(r.action_items)
      ? (r.action_items as IngestNoteInput["action_items"])
      : undefined,
    commitments: Array.isArray(r.commitments)
      ? (r.commitments as IngestNoteInput["commitments"])
      : undefined,
    customer_sentiment:
      r.customer_sentiment && typeof r.customer_sentiment === "object"
        ? (r.customer_sentiment as IngestNoteInput["customer_sentiment"])
        : undefined,
    competitive_landscape:
      r.competitive_landscape && typeof r.competitive_landscape === "object"
        ? (r.competitive_landscape as IngestNoteInput["competitive_landscape"])
        : undefined,
    budget_timeline:
      r.budget_timeline && typeof r.budget_timeline === "object"
        ? (r.budget_timeline as IngestNoteInput["budget_timeline"])
        : undefined,
    demo_poc_request:
      r.demo_poc_request && typeof r.demo_poc_request === "object"
        ? (r.demo_poc_request as IngestNoteInput["demo_poc_request"])
        : undefined,
    resources_shared: optStr(r.resources_shared),
    resources_requested_by_customer: optStr(r.resources_requested_by_customer),
    resources_requested_by_us: optStr(r.resources_requested_by_us),
    next_meeting:
      r.next_meeting && typeof r.next_meeting === "object"
        ? (r.next_meeting as IngestNoteInput["next_meeting"])
        : undefined,
    tags: Array.isArray(r.tags) ? (r.tags as string[]).map(String) : undefined,
    meeting_type: optStr(r.meeting_type),
    sales_stage: optStr(r.sales_stage),
  };
}

function collectAttendeeEmails(input: IngestNoteInput): string[] {
  const set = new Set<string>();
  for (const a of input.attendees ?? []) {
    const e = typeof a?.email === "string" ? a.email.trim().toLowerCase() : "";
    if (e) set.add(e);
  }
  return [...set];
}

router.post("/", async (req, res) => {
  const body = req.body as { notes?: unknown[]; ingested_by?: string };
  if (!Array.isArray(body.notes) || body.notes.length === 0) {
    res.status(400).json({ error: "Request body must include a non-empty notes array" });
    return;
  }

  const driveRoot = process.env.DRIVE_NOTES_PATH?.trim();
  if (!driveRoot) {
    res.status(400).json({ error: "DRIVE_NOTES_PATH is not configured on the server" });
    return;
  }
  if (!fs.existsSync(path.resolve(driveRoot))) {
    res.status(400).json({
      error: `Drive folder not found at ${path.resolve(driveRoot)}. Is Google Drive for Desktop running?`,
    });
    return;
  }

  const ingestedBy = String(body.ingested_by ?? "").trim().toLowerCase();
  const elastic = getElastic();
  const results: IngestNoteResult[] = [];
  let successCount = 0;

  for (const raw of body.notes) {
    if (!raw || typeof raw !== "object") {
      results.push({
        success: false,
        action: "error",
        version: 0,
        error: "Invalid note entry",
      });
      continue;
    }
    const row = raw as Record<string, unknown>;
    try {
      const input = rowToIngestInput(row);
      const updatedBy =
        ingestedBy || String(input.author_email ?? "").trim().toLowerCase() || "unknown";

      const existing = await elastic.getIngestedNote(input.note_id);
      if (
        existing?.local_file_path &&
        typeof existing.local_file_path === "string" &&
        existing.account !== input.account
      ) {
        const oldAbs = path.join(path.resolve(driveRoot), ...existing.local_file_path.split("/"));
        try {
          fs.unlinkSync(oldAbs);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn("Could not delete previous markdown file (continuing):", oldAbs, err);
        }
      }

      const meetingDate = input.meeting_date ?? new Date().toISOString();
      const emails = collectAttendeeEmails(input);
      const { suggestedGroupId, related } = await findMeetingGroup(
        elastic,
        meetingDate,
        emails,
        input.note_id,
      );
      let meeting_group_id = input.meeting_group_id ?? suggestedGroupId ?? undefined;
      if (!meeting_group_id && related.length) {
        meeting_group_id = randomUUID();
      }

      const ingestPayload: IngestNoteInput = {
        ...input,
        meeting_group_id,
        ingested_by: updatedBy,
      };

      const { outcome, version } = await elastic.indexNote(ingestPayload, {
        updatedBy,
        conflictRetries: 1,
      });

      const merged = await elastic.getIngestedNote(input.note_id);
      if (!merged) {
        throw new Error("Note not readable after index");
      }

      const filePayload = { ...merged, version } as unknown as NoteFilePayload;
      const localPath = writeNoteToFile(filePayload, driveRoot);
      await elastic.patchLocalFilePath(input.note_id, localPath);

      if (updatedBy && updatedBy !== "unknown") {
        await elastic.incrementNotesIngested(updatedBy, 1);
      }

      results.push({
        success: true,
        action: outcome,
        version,
        elastic_doc_id: input.note_id,
        local_file_path: localPath,
      });
      successCount++;
    } catch (e) {
      if (e instanceof errors.ResponseError && e.meta.statusCode === 409) {
        results.push({
          success: false,
          action: "error",
          version: 0,
          error: "Note was updated by someone else — refresh and try again",
        });
        continue;
      }
      const msg = e instanceof Error ? e.message : "Ingest failed";
      if (msg.includes("Drive folder not found") || msg.includes("Cannot write to Drive")) {
        results.push({ success: false, action: "error", version: 0, error: msg });
        continue;
      }
      results.push({ success: false, action: "error", version: 0, error: msg });
    }
  }

  res.json({ results, success_count: successCount });
});

export default router;
