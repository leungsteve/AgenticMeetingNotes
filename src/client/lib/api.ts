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

type JsonHeaders = { headers?: Record<string, string> };

export async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok) {
    let msg = text;
    try {
      const j = JSON.parse(text) as { error?: string };
      if (j.error) msg = j.error;
    } catch {
      /* use raw */
    }
    throw new ApiError(msg || res.statusText, res.status, text);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

export async function postJson<T>(url: string, body: unknown, extra?: JsonHeaders): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...extra?.headers },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = text;
    try {
      const j = JSON.parse(text) as { error?: string };
      if (j.error) msg = j.error;
    } catch {
      /* use raw */
    }
    throw new ApiError(msg || res.statusText, res.status, text);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

export async function putJson<T>(url: string, body: unknown, extra?: JsonHeaders): Promise<T> {
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...extra?.headers },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = text;
    try {
      const j = JSON.parse(text) as { error?: string };
      if (j.error) msg = j.error;
    } catch {
      /* use raw */
    }
    throw new ApiError(msg || res.statusText, res.status, text);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}
