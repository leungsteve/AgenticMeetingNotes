import fs from "node:fs";
import path from "node:path";
import type { NoteFilePayload } from "../types/file-note.js";

const INVALID_FILENAME_CHARS = /[/\\:*?"<>|]/g;

function sanitizeFilename(base: string, maxLen = 200): string {
  const cleaned = base.replace(INVALID_FILENAME_CHARS, "-").trim();
  if (cleaned.length <= maxLen) return cleaned;
  return cleaned.slice(0, maxLen).trim();
}

function formatDateForFilename(iso: string | null | undefined): string {
  if (!iso) return "unknown-date";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown-date";
  return d.toISOString().slice(0, 10);
}

function sectionTechnical(env: NoteFilePayload["technical_environment"]): string | null {
  if (!env) return null;
  const lines: string[] = [];
  const add = (label: string, val?: string | null) => {
    if (val?.trim()) lines.push(`- **${label}:** ${val.trim()}`);
  };
  add("Current Stack", env.current_stack);
  add("Pain Points", env.pain_points);
  add("Requirements", env.requirements);
  add("Scale", env.scale);
  add("Integrations", env.integrations);
  add("Constraints", env.constraints);
  if (!lines.length) return null;
  return `## Technical Environment\n${lines.join("\n")}`;
}

function sectionSentiment(s: NoteFilePayload["customer_sentiment"]): string | null {
  if (!s) return null;
  const lines: string[] = [];
  const add = (label: string, val?: string | null) => {
    if (val?.trim()) lines.push(`- **${label}:** ${val.trim()}`);
  };
  add("Overall", s.overall);
  add("Concerns", s.concerns);
  add("Objections", s.objections);
  add("Champion Signals", s.champion_signals);
  if (!lines.length) return null;
  return `## Customer Sentiment\n${lines.join("\n")}`;
}

function sectionCompetitive(c: NoteFilePayload["competitive_landscape"]): string | null {
  if (!c) return null;
  const lines: string[] = [];
  if (c.incumbent?.trim()) lines.push(`- **Incumbent:** ${c.incumbent.trim()}`);
  if (c.competitors_evaluating?.length)
    lines.push(`- **Evaluating:** ${c.competitors_evaluating.join(", ")}`);
  if (c.mentions?.trim()) lines.push(`- **Mentions:** ${c.mentions.trim()}`);
  if (c.differentiators?.trim())
    lines.push(`- **Our Differentiators:** ${c.differentiators.trim()}`);
  if (!lines.length) return null;
  return `## Competitive Landscape\n${lines.join("\n")}`;
}

function sectionBudget(bt: NoteFilePayload["budget_timeline"]): string | null {
  if (!bt) return null;
  const lines: string[] = [];
  const add = (label: string, val?: string | null) => {
    if (val?.trim()) lines.push(`- **${label}:** ${val.trim()}`);
  };
  add("Budget", bt.budget);
  add("Timeline", bt.timeline);
  add("Procurement", bt.procurement);
  add("Stage Signals", bt.stage_signals);
  if (!lines.length) return null;
  return `## Budget, Timeline & Procurement\n${lines.join("\n")}`;
}

function sectionDemo(d: NoteFilePayload["demo_poc_request"]): string | null {
  if (!d) return null;
  const lines: string[] = [];
  const add = (label: string, val?: string | null) => {
    if (val?.trim()) lines.push(`- **${label}:** ${val.trim()}`);
  };
  add("Description", d.description);
  add("Requirements", d.requirements);
  add("Data Available", d.data_available);
  add("Timeline", d.timeline);
  add("Success Criteria", d.success_criteria);
  add("Audience", d.audience);
  if (!lines.length) return null;
  return `## Demo / POC Request\n${lines.join("\n")}`;
}

function buildMarkdown(note: NoteFilePayload): string {
  const account = note.account?.trim() || "unassigned";
  const tags = (note.tags ?? []).join(", ") || "—";
  const header = [
    `# ${note.title?.trim() || "Untitled meeting"}`,
    `**Date:** ${note.meeting_date ?? "—"}`,
    `**Author:** ${note.author_name ?? "—"} (${note.author_role ?? "—"})`,
    `**Account:** ${account}`,
    `**Opportunity:** ${note.opportunity ?? "—"}`,
    `**Meeting Type:** ${note.meeting_type ?? "—"}`,
    `**Purpose:** ${note.meeting_purpose ?? "—"}`,
    `**Tags:** ${tags}`,
    `**Version:** ${note.version} | **Ingested:** ${note.ingested_at ?? "—"}`,
    "",
    "---",
    "",
  ].join("\n");

  const blocks: (string | null)[] = [];

  if (note.attendees?.length) {
    const lines = note.attendees.map((a) => {
      const role =
        a.role_flag && a.role_flag !== "none"
          ? ` (${String(a.role_flag).replace(/_/g, " ")})`
          : "";
      return `- ${a.name ?? "—"} — ${a.title ?? "—"} | ${a.company ?? "—"} | ${a.email ?? "—"}${role}`;
    });
    blocks.push(`## Attendees\n${lines.join("\n")}`);
  }

  if (note.summary?.trim()) blocks.push(`## Summary\n${note.summary.trim()}`);
  if (note.key_topics?.trim()) blocks.push(`## Key Topics\n${note.key_topics.trim()}`);
  if (note.decisions_made?.trim())
    blocks.push(`## Decisions Made\n${note.decisions_made.trim()}`);

  blocks.push(sectionTechnical(note.technical_environment));

  if (note.action_items?.length) {
    const lines = note.action_items.map(
      (ai) =>
        `- [ ] ${ai.description ?? "—"} — **Owner:** ${ai.owner ?? "—"} | **Due:** ${ai.due_date ?? "TBD"} | **Status:** ${ai.status ?? "open"}`,
    );
    blocks.push(`## Action Items\n${lines.join("\n")}`);
  }

  if (note.commitments?.length) {
    const lines = note.commitments.map(
      (c) =>
        `- ${c.description ?? "—"} — **By:** ${c.committed_by ?? "—"} | **When:** ${c.timeline ?? "—"}`,
    );
    blocks.push(`## Commitments Made\n${lines.join("\n")}`);
  }

  blocks.push(sectionSentiment(note.customer_sentiment));
  blocks.push(sectionCompetitive(note.competitive_landscape));
  blocks.push(sectionBudget(note.budget_timeline));
  blocks.push(sectionDemo(note.demo_poc_request));

  const resParts: string[] = [];
  if (
    note.resources_shared?.trim() ||
    note.resources_requested_by_customer?.trim() ||
    note.resources_requested_by_us?.trim()
  ) {
    resParts.push(`- **Shared:** ${note.resources_shared?.trim() || "—"}`);
    resParts.push(
      `- **Requested by Customer:** ${note.resources_requested_by_customer?.trim() || "—"}`,
    );
    resParts.push(
      `- **Requested by Us:** ${note.resources_requested_by_us?.trim() || "—"}`,
    );
    blocks.push(`## Resources\n${resParts.join("\n")}`);
  }

  if (note.open_questions?.trim()) blocks.push(`## Open Questions\n${note.open_questions.trim()}`);

  if (note.next_meeting?.date || note.next_meeting?.agenda?.trim()) {
    const parts: string[] = [];
    if (note.next_meeting.agenda?.trim()) parts.push(note.next_meeting.agenda.trim());
    if (note.next_meeting.date) {
      const attList = note.next_meeting.attendees?.length
        ? note.next_meeting.attendees.join(", ")
        : "";
      parts.push(
        `**Next Meeting:** ${note.next_meeting.date}${attList ? ` — Attendees: ${attList}` : ""}`,
      );
    }
    blocks.push(`## Next Steps / Follow-Up\n${parts.join("\n\n")}`);
  }

  if (note.transcript?.trim()) {
    blocks.push("---\n\n## Transcript\n\n" + note.transcript.trim());
  }

  return header + blocks.filter(Boolean).join("\n\n") + "\n";
}

/**
 * Writes an arbitrary Markdown file to the Drive root under a relative subpath.
 * Used by the Friday digest worker to land per-SE / per-manager weekly digests
 * alongside meeting notes. Returns path relative to `drivePath` using forward
 * slashes for cross-platform display.
 */
export function writeMarkdownToDrive(opts: {
  drivePath: string;
  relativeDir: string; // e.g. "_Digests/2026-W17"
  fileName: string; // e.g. "se-jane@elastic.co.md" — caller is responsible for sanity
  markdown: string;
}): string {
  const root = path.resolve(opts.drivePath);
  if (!fs.existsSync(root)) {
    throw new Error(
      `Drive folder not found at ${root}. Is Google Drive for Desktop running?`,
    );
  }
  const safeDir = opts.relativeDir
    .split(/[/\\]+/g)
    .map((seg) => seg.replace(INVALID_FILENAME_CHARS, "-").trim())
    .filter(Boolean)
    .join(path.sep);
  const safeFile = sanitizeFilename(opts.fileName.replace(INVALID_FILENAME_CHARS, "-"));
  const dir = path.join(root, safeDir);
  fs.mkdirSync(dir, { recursive: true });
  const fullPath = path.join(dir, safeFile);
  try {
    fs.writeFileSync(fullPath, opts.markdown, "utf8");
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "EACCES") {
      throw new Error(`Cannot write to Drive folder — check permissions (${fullPath})`);
    }
    throw e;
  }
  return path.join(safeDir, safeFile).split(path.sep).join("/");
}

/**
 * Writes a formatted Markdown file under the Drive root. Returns path relative to `drivePath`.
 */
export function writeNoteToFile(note: NoteFilePayload, drivePath: string): string {
  const root = path.resolve(drivePath);
  if (!fs.existsSync(root)) {
    throw new Error(
      `Drive folder not found at ${root}. Is Google Drive for Desktop running?`,
    );
  }

  const accountFolder = (note.account?.trim() || "unassigned").replace(INVALID_FILENAME_CHARS, "-");
  const dateStr = formatDateForFilename(note.meeting_date ?? null);
  const titlePart = note.title?.trim() || "Untitled";
  const authorRole = note.author_role?.trim() || "—";
  const authorName = note.author_name?.trim() || "—";
  let baseName = sanitizeFilename(`${dateStr} - ${titlePart} (${authorRole} - ${authorName})`);
  let fileName = `${baseName}.md`;
  const meetingNotesDir = path.join(root, accountFolder, "Meeting Notes");
  fs.mkdirSync(meetingNotesDir, { recursive: true });

  let fullPath = path.join(meetingNotesDir, fileName);
  if (fs.existsSync(fullPath)) {
    const id = note.note_id?.trim() || "note";
    baseName = sanitizeFilename(`${dateStr} - ${titlePart} (${authorRole} - ${authorName}) [${id}]`);
    fileName = `${baseName}.md`;
    fullPath = path.join(meetingNotesDir, fileName);
  }

  const md = buildMarkdown(note);
  try {
    fs.writeFileSync(fullPath, md, "utf8");
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "EACCES") {
      throw new Error(`Cannot write to Drive folder — check permissions (${fullPath})`);
    }
    throw e;
  }

  return path.join(accountFolder, "Meeting Notes", fileName).split(path.sep).join("/");
}
