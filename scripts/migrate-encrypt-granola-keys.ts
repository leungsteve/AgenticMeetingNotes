/**
 * One-time migration: encrypt every plaintext `granola_api_key` in the
 * `granola-sync-state` index with AES-256-GCM (AAD = user_email). Idempotent
 * — rows already in the `v1:…` ciphertext format are left alone.
 *
 * Pre-reqs:
 *   - `.env` has ELASTIC_CLOUD_ID + ELASTIC_API_KEY (the existing Elastic creds)
 *   - `.env` has MASTER_ENCRYPTION_KEY (32 bytes base64; generate with:
 *       node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
 *
 * Run with:
 *   npm run migrate:encrypt-keys
 *
 * Output:
 *   [migrate] alice@co.com — encrypted (8-char fingerprint AbCd1234)
 *   [migrate] bob@co.com   — already encrypted, skipping
 *   [migrate] done. encrypted=3 skipped=2 errors=0
 */
import "dotenv/config";
import { encryptApiKey, isEncrypted } from "../src/server/auth/crypto.js";
import { getElastic } from "../src/server/elastic-instance.js";

async function main(): Promise<void> {
  if (!process.env.MASTER_ENCRYPTION_KEY?.trim()) {
    console.error(
      "MASTER_ENCRYPTION_KEY is not set. Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
    );
    process.exit(1);
  }

  const elastic = getElastic();
  const members = await elastic.listSyncStates();
  let encrypted = 0;
  let skipped = 0;
  let errors = 0;

  for (const member of members) {
    const email = member.user_email;
    const key = member.granola_api_key;
    if (!email) {
      console.warn("[migrate] row missing user_email — skipping");
      continue;
    }
    if (!key) {
      console.log(`[migrate] ${email} — no key on file, skipping`);
      skipped++;
      continue;
    }
    if (isEncrypted(key)) {
      console.log(`[migrate] ${email} — already encrypted, skipping`);
      skipped++;
      continue;
    }
    try {
      const ciphertext = encryptApiKey(key, email);
      await elastic.upsertSyncState({ ...member, granola_api_key: ciphertext });
      const last4 = key.slice(-4);
      console.log(`[migrate] ${email} — encrypted (last 4 of plaintext was *${last4})`);
      encrypted++;
    } catch (e) {
      errors++;
      console.error(`[migrate] ${email} — FAILED: ${e instanceof Error ? e.message : e}`);
    }
  }

  console.log(`[migrate] done. encrypted=${encrypted} skipped=${skipped} errors=${errors}`);
  if (errors > 0) process.exit(2);
}

void main().catch((e) => {
  console.error("[migrate] fatal:", e);
  process.exit(1);
});
