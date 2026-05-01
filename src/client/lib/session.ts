const USER_KEY = "pipeline_user_email";

/**
 * Read the current user email from the local cache.
 *
 * In single-user dev mode this is a free-form value the user picks in
 * Settings (legacy behavior). In multi-user mode, `useSession` populates
 * this cache from `/api/me` after a successful Google sign-in, so callers
 * that read it synchronously continue to work.
 *
 * NOTE: this is only a *cache*. The server never trusts the value the
 * client sends; it derives the acting user from the signed session cookie.
 */
export function getSessionUserEmail(): string | null {
  try {
    return localStorage.getItem(USER_KEY)?.trim().toLowerCase() || null;
  } catch {
    return null;
  }
}

/**
 * Update the local cache. In multi-user mode `useSession` calls this on
 * boot with the verified email from `/api/me`. Manual callers (e.g. the
 * Settings "Current user" dropdown) only affect dev mode.
 */
export function setSessionUserEmail(email: string): void {
  localStorage.setItem(USER_KEY, email.trim().toLowerCase());
}

export function clearSessionUserEmail(): void {
  localStorage.removeItem(USER_KEY);
}

export function draftKey(noteId: string): string {
  return `enrich_draft_${noteId}`;
}

export function loadDraft<T>(noteId: string): T | null {
  try {
    const raw = localStorage.getItem(draftKey(noteId));
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function saveDraft(noteId: string, data: unknown): void {
  localStorage.setItem(draftKey(noteId), JSON.stringify(data));
}

export function clearDraft(noteId: string): void {
  localStorage.removeItem(draftKey(noteId));
}
