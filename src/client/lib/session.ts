const USER_KEY = "pipeline_user_email";

export function getSessionUserEmail(): string | null {
  try {
    return localStorage.getItem(USER_KEY)?.trim().toLowerCase() || null;
  } catch {
    return null;
  }
}

export function setSessionUserEmail(email: string): void {
  localStorage.setItem(USER_KEY, email.trim().toLowerCase());
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
