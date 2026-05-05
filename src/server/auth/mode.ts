import { timingSafeEqual } from "node:crypto";

/** Are we enforcing multi-user auth, or running in legacy single-user dev mode? */
export function multiUserEnabled(): boolean {
  return (process.env.MULTI_USER ?? "").trim().toLowerCase() === "true";
}

/** Client-visible auth mode (also returned on `/api/me` and `/api/auth-config`). */
export type ClientAuthMode = "legacy" | "google" | "demo";

export function isDemoAuthMode(): boolean {
  return multiUserEnabled() && (process.env.AUTH_MODE ?? "").trim().toLowerCase() === "demo";
}

export function getClientAuthMode(): ClientAuthMode {
  if (!multiUserEnabled()) return "legacy";
  return isDemoAuthMode() ? "demo" : "google";
}

/** Allowlisted demo identities (lowercased). */
export function parseDemoAuthEmails(): string[] {
  return (process.env.DEMO_AUTH_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function displayNameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  return local
    .replace(/[._-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

export function validateDemoAuthEnvOrExit(): void {
  if (!isDemoAuthMode()) return;
  const pin = (process.env.DEMO_AUTH_PIN ?? "").trim();
  const emails = parseDemoAuthEmails();
  if (pin.length < 8) {
    // eslint-disable-next-line no-console
    console.error(
      "[auth] AUTH_MODE=demo requires DEMO_AUTH_PIN (at least 8 characters). Generate a random string and share it only with demo operators.",
    );
    process.exit(1);
  }
  if (!emails.length) {
    // eslint-disable-next-line no-console
    console.error(
      "[auth] AUTH_MODE=demo requires DEMO_AUTH_EMAILS — a comma-separated list of emails that may sign in (e.g. ae1@demo.local,sa1@demo.local).",
    );
    process.exit(1);
  }
}

export function demoPinMatches(supplied: string): boolean {
  const expected = (process.env.DEMO_AUTH_PIN ?? "").trim();
  if (!expected || supplied === undefined || supplied === null) return false;
  try {
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(String(supplied), "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function isDemoEmailAllowed(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  const allow = new Set(parseDemoAuthEmails());
  return allow.has(normalized);
}
