const DEFAULT_BASE = "https://public-api.granola.ai";

export class GranolaApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: string,
  ) {
    super(message);
    this.name = "GranolaApiError";
  }
}

export interface GranolaUser {
  name: string | null;
  email: string;
}

export interface GranolaNoteSummary {
  id: string;
  object?: string;
  title: string | null;
  owner: GranolaUser;
  created_at: string;
  updated_at: string;
}

export interface GranolaNote extends GranolaNoteSummary {
  web_url?: string;
  calendar_event?: Record<string, unknown> | null;
  attendees: GranolaUser[];
  folder_membership?: unknown[];
  summary_text: string;
  summary_markdown: string | null;
  transcript: unknown;
}

interface ListNotesResponse {
  notes: GranolaNoteSummary[];
  hasMore: boolean;
  cursor: string | null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export class GranolaClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(apiKey: string, options?: { baseUrl?: string }) {
    this.apiKey = apiKey.trim();
    this.baseUrl = (options?.baseUrl ?? process.env.GRANOLA_API_BASE ?? DEFAULT_BASE).replace(
      /\/+$/,
      "",
    );
  }

  /**
   * Build a client from env: `GRANOLA_API_KEY` + optional `GRANOLA_API_BASE` (must be a URL if set).
   * If `GRANOLA_API_BASE` looks like an API key (e.g. starts with `grn_`), it is used as the key and the default public API host is used.
   */
  static fromEnv(): GranolaClient {
    const baseEnv = process.env.GRANOLA_API_BASE?.trim();
    const keyEnv = process.env.GRANOLA_API_KEY?.trim();
    const baseIsUrl = baseEnv && /^https?:\/\//i.test(baseEnv);

    if (baseIsUrl && keyEnv) {
      return new GranolaClient(keyEnv, { baseUrl: baseEnv });
    }
    if (baseIsUrl && !keyEnv) {
      throw new Error("GRANOLA_API_KEY is not set (GRANOLA_API_BASE must be a URL, not the API key).");
    }
    if (!baseIsUrl && baseEnv?.startsWith("grn_")) {
      return new GranolaClient(baseEnv, { baseUrl: DEFAULT_BASE });
    }
    if (keyEnv) {
      return new GranolaClient(keyEnv, { baseUrl: baseIsUrl ? baseEnv! : DEFAULT_BASE });
    }
    throw new Error(
      "Set GRANOLA_API_KEY in .env (and optionally GRANOLA_API_BASE=https://public-api.granola.ai).",
    );
  }

  private async request(
    path: string,
    init?: RequestInit & { searchParams?: Record<string, string | undefined> },
  ): Promise<Response> {
    const url = new URL(`${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`);
    if (init?.searchParams) {
      for (const [k, v] of Object.entries(init.searchParams)) {
        if (v !== undefined && v !== "") url.searchParams.set(k, v);
      }
    }
    const fetchInit = { ...(init ?? {}) } as RequestInit & {
      searchParams?: Record<string, string | undefined>;
    };
    delete fetchInit.searchParams;
    const headers = new Headers(fetchInit.headers);
    headers.set("Authorization", `Bearer ${this.apiKey}`);
    if (!headers.has("Accept")) headers.set("Accept", "application/json");

    let attempt = 0;
    const maxAttempts = 4;
    while (true) {
      const res = await fetch(url, { ...fetchInit, headers });
      if (res.status === 429 && attempt < maxAttempts - 1) {
        const backoffMs = Math.min(8000, 500 * 2 ** attempt);
        attempt++;
        await sleep(backoffMs);
        continue;
      }
      return res;
    }
  }

  /**
   * Lists all notes the key can access, following cursor pagination until complete.
   */
  async listNotes(createdAfter?: Date): Promise<GranolaNoteSummary[]> {
    const out: GranolaNoteSummary[] = [];
    let cursor: string | null | undefined;
    do {
      const searchParams: Record<string, string | undefined> = {
        page_size: "30",
        cursor: cursor ?? undefined,
        created_after: createdAfter?.toISOString(),
      };
      const res = await this.request("/v1/notes", { method: "GET", searchParams });
      const text = await res.text();
      if (res.status === 401) {
        throw new GranolaApiError("API key invalid or expired", 401, text);
      }
      if (!res.ok) {
        throw new GranolaApiError(`Granola list notes failed: HTTP ${res.status}`, res.status, text);
      }
      const data = JSON.parse(text) as ListNotesResponse;
      out.push(...(data.notes ?? []));
      cursor = data.hasMore && data.cursor ? data.cursor : undefined;
    } while (cursor);
    return out;
  }

  /**
   * Fetches a single note; use includeTranscript for full transcript payload.
   */
  async getNote(id: string, includeTranscript = true): Promise<GranolaNote> {
    const searchParams: Record<string, string | undefined> = {};
    if (includeTranscript) searchParams.include = "transcript";
    const res = await this.request(`/v1/notes/${encodeURIComponent(id)}`, {
      method: "GET",
      searchParams,
    });
    const text = await res.text();
    if (res.status === 401) {
      throw new GranolaApiError("API key invalid or expired", 401, text);
    }
    if (res.status === 404) {
      throw new GranolaApiError("Note not found", 404, text);
    }
    if (!res.ok) {
      throw new GranolaApiError(`Granola get note failed: HTTP ${res.status}`, res.status, text);
    }
    return JSON.parse(text) as GranolaNote;
  }
}

/** Flatten transcript segments to plain text for Elastic / parsing. */
export function granolaTranscriptToText(transcript: unknown): string | null {
  if (transcript == null) return null;
  if (typeof transcript === "string") return transcript;
  if (!Array.isArray(transcript)) return null;
  const lines: string[] = [];
  for (const row of transcript) {
    if (row && typeof row === "object" && "text" in row && typeof (row as { text: unknown }).text === "string") {
      lines.push((row as { text: string }).text);
    }
  }
  const joined = lines.join("\n\n").trim();
  return joined.length ? joined : null;
}
