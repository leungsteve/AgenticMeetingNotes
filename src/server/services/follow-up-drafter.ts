import { randomUUID } from "node:crypto";
import { getElastic } from "../elastic-instance.js";
import type { EmailDraftDocument } from "./elastic.js";

interface NoteContext {
  note_id: string;
  account?: string | null;
  opportunity_id?: string | null;
  title?: string | null;
  summary?: string | null;
  action_items?: Array<{ description?: string; owner?: string }> | null;
  commitments?: Array<{ description?: string; committed_by?: string }> | null;
  attendees?: Array<{ email?: string; name?: string }> | null;
  meeting_date?: string | null;
  owner_email: string;
}

interface DraftResult {
  subject: string;
  body: string;
  draft_type: EmailDraftDocument["draft_type"];
  recipient_hint?: string;
  skipped?: boolean;
}

/**
 * Prompt sent to the Agent Builder agent as the `input` field.
 * The agent is instructed to return a JSON block the drafter can parse.
 */
function buildDrafterPrompt(noteCtx: NoteContext): string {
  const actionItemLines =
    noteCtx.action_items
      ?.map((ai) => `- ${ai.description ?? ""}${ai.owner ? ` (owner: ${ai.owner})` : ""}`)
      .join("\n") ?? "none";

  const commitmentLines =
    noteCtx.commitments
      ?.map((c) => `- ${c.description ?? ""}${c.committed_by ? ` (by: ${c.committed_by})` : ""}`)
      .join("\n") ?? "none";

  const attendeeList =
    noteCtx.attendees
      ?.map((a) => a.email ?? a.name ?? "")
      .filter(Boolean)
      .join(", ") ?? "unknown";

  return `You are the Follow-up Drafter. Given a meeting note, decide whether a follow-up email should be drafted.

Rules:
- Action items, commitments, or clear next steps → draft a customer recap or internal follow-up.
- Purely internal meeting, no external attendees → internal_followup.
- Quick 1:1, no commitments → should_draft: false.

Respond ONLY with a JSON block (no prose outside it):
{"should_draft":true,"draft_type":"customer_recap","subject":"...","body":"...","recipient_hint":"..."}
or: {"should_draft":false}

Keep emails concise (3-6 sentences or short bullets). Cite what was discussed. Do not mention internal tool names or note IDs.

Meeting note:
Title: ${noteCtx.title ?? "(untitled)"}
Account: ${noteCtx.account ?? "unknown"}
Date: ${noteCtx.meeting_date ?? "unknown"}
Attendees: ${attendeeList}
Summary: ${noteCtx.summary ?? "(none)"}
Action items:
${actionItemLines}
Commitments:
${commitmentLines}`;
}

async function callAgentBuilderLLM(noteCtx: NoteContext): Promise<DraftResult | null> {
  const baseUrl = process.env.AGENT_BUILDER_URL?.replace(/\/+$/, "");
  const apiKey = process.env.AGENT_BUILDER_API_KEY ?? process.env.ELASTIC_API_KEY;
  if (!baseUrl || !apiKey) return null;

  const agentId = process.env.AGENT_BUILDER_DRAFTER_AGENT_ID ?? "elastic-ai-agent";

  const requestBody = {
    input: buildDrafterPrompt(noteCtx),
    agent_id: agentId,
  };

  try {
    const res = await fetch(`${baseUrl}/api/agent_builder/converse`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `ApiKey ${apiKey}`,
        "kbn-xsrf": "true",
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.warn(`[follow-up-drafter] Agent Builder ${res.status}: ${await res.text()}`);
      return null;
    }
    const json = (await res.json()) as { response?: { message?: string }; status?: string };
    const content = json.response?.message?.trim() ?? "";
    if (!content) return null;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]) as {
      should_draft?: boolean;
      draft_type?: string;
      subject?: string;
      body?: string;
      recipient_hint?: string;
    };
    if (!parsed.should_draft) return { skipped: true, subject: "", body: "", draft_type: "other" };
    return {
      subject: parsed.subject ?? "Follow-up",
      body: parsed.body ?? "",
      draft_type: (parsed.draft_type as EmailDraftDocument["draft_type"]) ?? "other",
      recipient_hint: parsed.recipient_hint ?? undefined,
    };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[follow-up-drafter] Agent Builder call failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

function templateDraft(noteCtx: NoteContext): DraftResult {
  const account = noteCtx.account ?? "your team";
  const title = noteCtx.title ?? "our recent meeting";
  const actionLines =
    noteCtx.action_items
      ?.slice(0, 3)
      .map((ai) => `• ${ai.description ?? ""}`)
      .join("\n") ?? "";

  const subject = `Follow-up: ${title}`;
  const body = `Hi team,

Thanks for a productive session on ${title} with ${account}.

${actionLines ? `Key follow-ups from the meeting:\n${actionLines}\n` : ""}
Please let me know if you have any questions or if anything has shifted since we spoke.

Best,
[Your name]`;

  return { subject, body, draft_type: "customer_recap" };
}

export async function generateAndPersistDraft(noteCtx: NoteContext): Promise<void> {
  const hasSignals =
    (noteCtx.action_items?.length ?? 0) > 0 || (noteCtx.commitments?.length ?? 0) > 0;

  if (!hasSignals && !noteCtx.summary) return;

  const llmResult = await callAgentBuilderLLM(noteCtx);
  if (llmResult?.skipped) return;

  const draft: DraftResult = llmResult ?? templateDraft(noteCtx);

  const doc: EmailDraftDocument = {
    draft_id: randomUUID(),
    note_id: noteCtx.note_id,
    account: noteCtx.account ?? undefined,
    opportunity_id: noteCtx.opportunity_id ?? undefined,
    owner: noteCtx.owner_email,
    subject: draft.subject,
    body: draft.body,
    recipient_hint: draft.recipient_hint,
    draft_type: draft.draft_type,
    status: "pending",
    source_note_title: noteCtx.title ?? undefined,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  await getElastic().createEmailDraft(doc);
}
