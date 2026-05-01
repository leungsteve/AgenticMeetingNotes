import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";
const VERSION_PREFIX = "v1:";
const IV_LEN = 12;
const TAG_LEN = 16;

let cachedKey: Buffer | undefined;

function loadMasterKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.MASTER_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new Error(
      "MASTER_ENCRYPTION_KEY is not set. Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
    );
  }
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) {
    throw new Error(
      `MASTER_ENCRYPTION_KEY must decode to 32 bytes (got ${buf.length}). Use a 32-byte base64 value.`,
    );
  }
  cachedKey = buf;
  return cachedKey;
}

/** Returns true iff `stored` looks like a value produced by `encryptApiKey`. */
export function isEncrypted(stored: string | null | undefined): boolean {
  return typeof stored === "string" && stored.startsWith(VERSION_PREFIX);
}

/**
 * AES-256-GCM with the user's email as additional authenticated data, so a
 * ciphertext copied between rows fails to decrypt — defends against record
 * substitution if someone gets write access to Elastic.
 */
export function encryptApiKey(plaintext: string, aad: string): string {
  const key = loadMasterKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv, { authTagLength: TAG_LEN });
  cipher.setAAD(Buffer.from(aad.trim().toLowerCase(), "utf8"));
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return VERSION_PREFIX + Buffer.concat([iv, enc, tag]).toString("base64");
}

/**
 * Decrypts a value produced by `encryptApiKey`. If the input is not in the
 * versioned ciphertext format we treat it as legacy plaintext and return it
 * verbatim — useful during migration. Throws on tampered ciphertext.
 */
export function decryptApiKey(stored: string, aad: string): string {
  if (!isEncrypted(stored)) {
    return stored;
  }
  const key = loadMasterKey();
  const blob = Buffer.from(stored.slice(VERSION_PREFIX.length), "base64");
  if (blob.length < IV_LEN + TAG_LEN + 1) {
    throw new Error("Ciphertext too short — corrupt or tampered");
  }
  const iv = blob.subarray(0, IV_LEN);
  const tag = blob.subarray(blob.length - TAG_LEN);
  const ct = blob.subarray(IV_LEN, blob.length - TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv, { authTagLength: TAG_LEN });
  decipher.setAAD(Buffer.from(aad.trim().toLowerCase(), "utf8"));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

/** Test-only helper to drop the cached key (e.g. after rotating env in tests). */
export function _resetMasterKeyCache(): void {
  cachedKey = undefined;
}
