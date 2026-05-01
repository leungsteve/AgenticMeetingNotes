/** Read the admin allowlist from env. */
function readAdminEmails(): Set<string> {
  const raw = process.env.ADMIN_EMAILS ?? "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

let cached: Set<string> | undefined;

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  cached ??= readAdminEmails();
  return cached.has(email.trim().toLowerCase());
}

/** Useful for tests / hot-reload to drop the cache. */
export function _resetAdminCache(): void {
  cached = undefined;
}
