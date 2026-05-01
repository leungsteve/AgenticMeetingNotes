import { Router } from "express";
import { decryptApiKey, encryptApiKey, isEncrypted } from "../auth/crypto.js";
import { multiUserEnabled } from "../auth/middleware.js";
import { getElastic } from "../elastic-instance.js";
import type { SyncStateDocument } from "../services/elastic.js";
import { GranolaApiError, GranolaClient } from "../services/granola.js";

const router = Router();

function maskKey(key: string | undefined): string | undefined {
  if (!key) return undefined;
  if (isEncrypted(key)) return "********(encrypted)";
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

/**
 * In multi-user mode the caller may only act on their own row unless they
 * are an admin. In single-user dev mode the request always succeeds (the
 * dev fallback user has admin = true).
 */
function ensureSelfOrAdmin(
  callerEmail: string,
  callerIsAdmin: boolean,
  targetEmail: string,
): { ok: true } | { ok: false; status: number; error: string } {
  if (!multiUserEnabled()) return { ok: true };
  if (callerIsAdmin) return { ok: true };
  if (callerEmail.trim().toLowerCase() === targetEmail.trim().toLowerCase()) {
    return { ok: true };
  }
  return {
    ok: false,
    status: 403,
    error: "You can only manage your own team-member row. Ask an admin to edit other users.",
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
  const guard = ensureSelfOrAdmin(req.user!.email, req.user!.isAdmin, userEmail);
  if (!guard.ok) {
    res.status(guard.status).json({ error: guard.error });
    return;
  }
  try {
    const elastic = getElastic();
    const member = await elastic.getSyncStateByEmail(userEmail);
    if (!member?.granola_api_key) {
      res.status(400).json({ error: "No API key stored for this user" });
      return;
    }
    let plaintext: string;
    try {
      plaintext = decryptApiKey(member.granola_api_key, userEmail);
    } catch (e) {
      res.status(500).json({
        error: "Failed to decrypt stored Granola key — re-save it on this row",
        detail: e instanceof Error ? e.message : "decrypt failed",
      });
      return;
    }
    const client = new GranolaClient(plaintext);
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
    const guard = ensureSelfOrAdmin(req.user!.email, req.user!.isAdmin, user_email);
    if (!guard.ok) {
      res.status(guard.status).json({ error: guard.error });
      return;
    }

    const elastic = getElastic();
    const existing = await elastic.getSyncStateByEmail(user_email);

    // Encrypt the incoming plaintext key (if any). If the caller did not
    // supply a new key, keep whatever ciphertext we already had.
    let storedKey: string | undefined;
    if (typeof body.granola_api_key === "string" && body.granola_api_key.length > 0) {
      const incoming = body.granola_api_key.trim();
      // If for some reason the caller already sent us ciphertext (e.g. a
      // re-import path), accept it as-is. Otherwise encrypt.
      storedKey = isEncrypted(incoming) ? incoming : encryptApiKey(incoming, user_email);
    } else {
      storedKey = existing?.granola_api_key;
    }

    const merged: SyncStateDocument = {
      user_email,
      user_name: body.user_name ?? existing?.user_name ?? user_email,
      user_role: body.user_role ?? existing?.user_role,
      granola_api_key: storedKey,
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
