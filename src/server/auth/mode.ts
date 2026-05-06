import { timingSafeEqual } from "node:crypto";
import { DEMO_PERSONAS, getDemoPersona } from "../demo/demo-personas.js";

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

/**
 * Emails that may sign in when AUTH_MODE=demo.
 * If `DEMO_AUTH_EMAILS` is unset or empty, every email in `DEMO_PERSONAS` is allowed.
 * If set, it must be a subset of that roster (comma-separated).
 */
export function parseDemoAuthEmails(): string[] {
  const roster = new Set(DEMO_PERSONAS.map((p) => p.email.toLowerCase()));
  const fromEnv = (process.env.DEMO_AUTH_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (!fromEnv.length) {
    return [...roster];
  }
  return fromEnv.filter((e) => roster.has(e));
}

export function displayNameFromEmail(email: string): string {
  const persona = getDemoPersona(email);
  if (persona) return persona.name;
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
      "[auth] AUTH_MODE=demo: no valid demo emails — leave DEMO_AUTH_EMAILS unset to allow the full synthetic cast, or set it to a comma-separated subset of emails from src/server/demo/demo-personas.ts",
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
