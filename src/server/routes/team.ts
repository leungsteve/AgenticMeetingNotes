import { Router } from "express";
import { getElastic } from "../elastic-instance.js";
import type { SyncStateDocument } from "../services/elastic.js";
import { GranolaApiError, GranolaClient } from "../services/granola.js";

const router = Router();

function maskKey(key: string | undefined): string | undefined {
  if (!key) return undefined;
  if (key.length <= 8) return "********";
  return `********${key.slice(-4)}`;
}

function sanitizeMemberResponse(doc: SyncStateDocument): Omit<SyncStateDocument, "granola_api_key"> & {
  granola_api_key_masked?: string;
} {
  const { granola_api_key, ...rest } = doc;
  return {
    ...rest,
    granola_api_key_masked: maskKey(granola_api_key),
  };
}

router.get("/", async (_req, res) => {
  try {
    const elastic = getElastic();
    const members = await elastic.listSyncStates();
    res.json(members.map(sanitizeMemberResponse));
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
    res.status(500).json({ error: "Failed to list team members" });
  }
});

/** Test stored Granola key (Settings → Test Connection). Body: { user_email }. */
router.post("/test-granola", async (req, res) => {
  const userEmail = String(req.query.user_email ?? req.body?.user_email ?? "")
    .trim()
    .toLowerCase();
  if (!userEmail) {
    res.status(400).json({ error: "user_email is required" });
    return;
  }
  try {
    const elastic = getElastic();
    const member = await elastic.getSyncStateByEmail(userEmail);
    if (!member?.granola_api_key) {
      res.status(400).json({ error: "No API key stored for this user" });
      return;
    }
    const client = new GranolaClient(member.granola_api_key);
    await client.listNotes(new Date(Date.now() - 86400e5 * 365 * 5));
    res.json({ ok: true, message: "Granola API key is valid" });
  } catch (e) {
    if (e instanceof GranolaApiError && e.status === 401) {
      res.status(401).json({ error: "API key invalid or expired" });
      return;
    }
    res.status(502).json({ error: e instanceof Error ? e.message : "Connection failed" });
  }
});

router.post("/", async (req, res) => {
  try {
    const body = req.body as Partial<SyncStateDocument> & { granola_api_key?: string };
    const user_email = String(body.user_email ?? "")
      .trim()
      .toLowerCase();
    if (!user_email) {
      res.status(400).json({ error: "user_email is required" });
      return;
    }
    const elastic = getElastic();
    const existing = await elastic.getSyncStateByEmail(user_email);
    const merged: SyncStateDocument = {
      user_email,
      user_name: body.user_name ?? existing?.user_name ?? user_email,
      user_role: body.user_role ?? existing?.user_role,
      granola_api_key: body.granola_api_key ?? existing?.granola_api_key,
      last_fetched_at: existing?.last_fetched_at,
      last_fetched_cursor: existing?.last_fetched_cursor,
      total_notes_fetched: existing?.total_notes_fetched ?? 0,
      total_notes_ingested: existing?.total_notes_ingested ?? 0,
    };
    if (!merged.granola_api_key) {
      res.status(400).json({ error: "granola_api_key is required for new members" });
      return;
    }
    await elastic.upsertSyncState(merged);
    res.json(sanitizeMemberResponse(merged));
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
    res.status(500).json({ error: "Failed to save team member" });
  }
});

export default router;
