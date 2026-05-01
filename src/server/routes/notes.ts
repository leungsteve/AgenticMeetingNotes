import { Router } from "express";
import { decryptApiKey } from "../auth/crypto.js";
import { getRequestScope } from "../auth/scope.js";
import { getElastic } from "../elastic-instance.js";
import { GranolaApiError, GranolaClient, granolaTranscriptToText } from "../services/granola.js";
import { suggestTags } from "../services/enrichment.js";
import { parseGranolaSummaryMarkdown } from "../utils/granola-summary-parser.js";

const router = Router();

/**
 * Look up a team member's stored Granola API key, decrypt it, and confirm
 * the caller is authorized to act on that user's behalf. Non-admins can
 * only operate on their own row.
 */
async function resolveGranolaKey(
  req: Parameters<Parameters<typeof router.get>[1]>[0],
  rawUserEmail: string,
): Promise<{ ok: true; key: string; userEmail: string } | { ok: false; status: number; error: string }> {
  const scope = await getRequestScope(req);
  const userEmail = rawUserEmail.trim().toLowerCase();
  if (!userEmail) {
    return { ok: false, status: 400, error: "user_email query parameter is required" };
  }
  if (!scope.isAdmin && userEmail !== scope.email) {
    return {
      ok: false,
      status: 403,
      error: "You can only pull notes for your own account. Ask an admin to run for someone else.",
    };
  }
  const elastic = getElastic();
  const member = await elastic.getSyncStateByEmail(userEmail);
  if (!member?.granola_api_key) {
    return {
      ok: false,
      status: 400,
      error: "No Granola API key configured for this user. Add one in Settings.",
    };
  }
  let key: string;
  try {
    key = decryptApiKey(member.granola_api_key, userEmail);
  } catch (e) {
    return {
      ok: false,
      status: 500,
      error: `Failed to decrypt stored Granola key: ${e instanceof Error ? e.message : "unknown"}`,
    };
  }
  return { ok: true, key, userEmail };
}

function currentMetadata(src: Record<string, unknown> | undefined) {
  if (!src) return undefined;
  return {
    account: src.account ?? null,
    opportunity: src.opportunity ?? null,
    tags: src.tags ?? [],
    meeting_type: src.meeting_type ?? null,
    sales_stage: src.sales_stage ?? null,
  };
}

router.get("/", async (req, res) => {
  const resolved = await resolveGranolaKey(req, String(req.query.user_email ?? ""));
  if (!resolved.ok) {
    res.status(resolved.status).json({ error: resolved.error });
    return;
  }
  const { key, userEmail } = resolved;
  void userEmail;

  const createdAfterRaw = req.query.created_after ?? req.query.created_from;
  let createdAfter: Date | undefined;
  if (typeof createdAfterRaw === "string" && createdAfterRaw.trim()) {
    const d = new Date(createdAfterRaw);
    if (!Number.isNaN(d.getTime())) createdAfter = d;
  }

  try {
    const elastic = getElastic();
    const client = new GranolaClient(key);
    const [granolaNotes, ingestedIds] = await Promise.all([
      client.listNotes(createdAfter),
      elastic.getIngestedNoteIds(),
    ]);
    const ingestedSet = new Set(ingestedIds);
    const needMeta = granolaNotes.filter((n) => ingestedSet.has(n.id)).map((n) => n.id);
    const metaMap = await elastic.mGetIngestedNotesByIds(needMeta);

    const notes = granolaNotes.map((n) => {
      const src = metaMap.get(n.id);
      const already = ingestedSet.has(n.id);
      return {
        id: n.id,
        title: n.title,
        date: n.created_at,
        attendees: 0,
        already_ingested: already,
        ingested_date: already ? (src?.ingested_at as string | undefined) : undefined,
        version: already ? (src?.version as number | undefined) : undefined,
        current_metadata: already ? currentMetadata(src) : undefined,
      };
    });

    res.json(notes);
  } catch (e) {
    if (e instanceof GranolaApiError) {
      if (e.status === 401) {
        res.status(401).json({ error: "API key invalid or expired" });
        return;
      }
      res.status(e.status >= 400 && e.status < 600 ? e.status : 502).json({ error: e.message });
      return;
    }
    // eslint-disable-next-line no-console
    console.error(e);
    res.status(500).json({ error: "Failed to list notes" });
  }
});

router.get("/:id", async (req, res) => {
  const resolved = await resolveGranolaKey(req, String(req.query.user_email ?? ""));
  if (!resolved.ok) {
    res.status(resolved.status).json({ error: resolved.error });
    return;
  }
  const { key } = resolved;
  const id = req.params.id;

  try {
    const elastic = getElastic();
    const client = new GranolaClient(key);
    const note = await client.getNote(id, true);
    const summaryMd = note.summary_markdown ?? note.summary_text ?? "";
    const summaryText = note.summary_text ?? "";
    const parsed = parseGranolaSummaryMarkdown(summaryMd || summaryText);

    const suggested_tags = suggestTags(summaryText || summaryMd, {
      key_topics: parsed.key_topics,
      decisions_made: parsed.decisions_made,
      budget_timeline: parsed.budget_timeline as never,
      competitive_landscape: parsed.competitive_landscape
        ? {
            incumbent: parsed.competitive_landscape.incumbent,
            competitors_evaluating: parsed.competitive_landscape.competitors_evaluating
              ?.split(/[,;]+/)
              .map((s) => s.trim())
              .filter(Boolean),
            mentions: parsed.competitive_landscape.mentions,
            differentiators: parsed.competitive_landscape.differentiators,
          }
        : null,
      technical_environment: parsed.technical_environment ?? undefined,
      customer_sentiment: parsed.customer_sentiment ?? undefined,
      open_questions: parsed.open_questions,
      next_meeting: undefined,
    });

    const existing = await elastic.getIngestedNote(id);
    const elastic_metadata = existing ?? undefined;

    res.json({
      id: note.id,
      title: note.title,
      created_at: note.created_at,
      updated_at: note.updated_at,
      owner: note.owner,
      web_url: note.web_url,
      calendar_event: note.calendar_event,
      attendees: note.attendees,
      summary_text: note.summary_text,
      summary_markdown: note.summary_markdown,
      transcript: granolaTranscriptToText(note.transcript),
      suggested_tags,
      parsed_from_summary: parsed,
      elastic_metadata,
    });
  } catch (e) {
    if (e instanceof GranolaApiError) {
      if (e.status === 401) {
        res.status(401).json({ error: "API key invalid or expired" });
        return;
      }
      if (e.status === 404) {
        res.status(404).json({ error: "Note not found" });
        return;
      }
      res.status(e.status >= 400 && e.status < 600 ? e.status : 502).json({ error: e.message });
      return;
    }
    // eslint-disable-next-line no-console
    console.error(e);
    res.status(500).json({ error: "Failed to load note" });
  }
});

export default router;
