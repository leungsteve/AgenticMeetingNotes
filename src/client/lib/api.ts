export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type JsonHeaders = { headers?: Record<string, string>; suppressLoginRedirect?: boolean };

/**
 * On a 401 from the server, follow `login_url` (issued by `requireUser`) so
 * the user is bounced to Google. Only fires in the browser; SSR/test paths
 * just throw the ApiError as usual.
 *
 * The session-bootstrap call (`/api/me`) explicitly opts out via
 * `suppressLoginRedirect: true` — we want that 401 to surface to the React
 * tree so the SignInScreen can render instead of full-page redirecting.
 */
function maybeRedirectToLogin(parsed: unknown): void {
  if (typeof window === "undefined") return;
  const loginUrl =
    parsed && typeof parsed === "object" && "login_url" in parsed
      ? (parsed as { login_url?: unknown }).login_url
      : undefined;
  if (typeof loginUrl === "string" && loginUrl.length > 0) {
    const here = window.location.pathname + window.location.search;
    window.location.href = `${loginUrl}?returnTo=${encodeURIComponent(here)}`;
  }
}

async function handleResponse<T>(res: Response, opts?: JsonHeaders): Promise<T> {
  const text = await res.text();
  if (!res.ok) {
    let parsed: unknown = undefined;
    let msg = text;
    try {
      parsed = JSON.parse(text);
      const error = (parsed as { error?: string } | undefined)?.error;
      if (error) msg = error;
    } catch {
      /* use raw */
    }
    if (res.status === 401 && !opts?.suppressLoginRedirect) {
      maybeRedirectToLogin(parsed);
    }
    throw new ApiError(msg || res.statusText, res.status, text);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

export async function getJson<T>(url: string, extra?: JsonHeaders): Promise<T> {
  const res = await fetch(url, { credentials: "include", headers: extra?.headers });
  return handleResponse<T>(res, extra);
}

export async function postJson<T>(url: string, body: unknown, extra?: JsonHeaders): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...extra?.headers },
    body: JSON.stringify(body),
  });
  return handleResponse<T>(res, extra);
}

export async function putJson<T>(url: string, body: unknown, extra?: JsonHeaders): Promise<T> {
  const res = await fetch(url, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...extra?.headers },
    body: JSON.stringify(body),
  });
  return handleResponse<T>(res, extra);
}
