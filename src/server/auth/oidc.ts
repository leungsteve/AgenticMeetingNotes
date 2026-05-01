import * as client from "openid-client";

const GOOGLE_ISSUER = new URL("https://accounts.google.com");

interface OidcEnv {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  /** Comma-separated Google Workspace domain allowlist (e.g. "co.com,co-eu.com"). */
  allowedHd: string[];
}

interface OidcConfig {
  config: client.Configuration;
  env: OidcEnv;
}

let configPromise: Promise<OidcConfig> | undefined;

function readOidcEnv(): OidcEnv | null {
  const clientId = process.env.GOOGLE_OIDC_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_OIDC_CLIENT_SECRET?.trim();
  const redirectUri = process.env.GOOGLE_OIDC_REDIRECT_URI?.trim();
  if (!clientId || !clientSecret || !redirectUri) return null;
  const allowedHd = (process.env.ALLOWED_HD ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return { clientId, clientSecret, redirectUri, allowedHd };
}

/**
 * Lazily discover Google's OIDC metadata and build a reusable Configuration.
 * Returns null if env is incomplete (so callers can fail with a clear message).
 */
export async function loadOidcConfig(): Promise<OidcConfig | null> {
  const env = readOidcEnv();
  if (!env) return null;
  configPromise ??= (async () => {
    const config = await client.discovery(GOOGLE_ISSUER, env.clientId, env.clientSecret);
    return { config, env };
  })();
  return configPromise;
}

export interface AuthRedirect {
  url: string;
  state: string;
  codeVerifier: string;
  nonce: string;
}

/**
 * Build the Google authorization URL with PKCE + nonce + Workspace `hd` hint.
 * The caller is responsible for persisting `state` / `codeVerifier` / `nonce`
 * in the session cookie until the callback fires.
 */
export async function buildGoogleAuthRedirect(returnTo?: string): Promise<AuthRedirect | null> {
  const loaded = await loadOidcConfig();
  if (!loaded) return null;
  const { config, env } = loaded;

  const codeVerifier = client.randomPKCECodeVerifier();
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
  const state = client.randomState();
  const nonce = client.randomNonce();

  const params: Record<string, string> = {
    redirect_uri: env.redirectUri,
    scope: "openid email profile",
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  };
  // `hd` is a Google-specific hint that pre-filters the account chooser to a
  // single Workspace domain. Real enforcement still happens server-side after
  // we read `claims.hd` from the ID token in `exchangeCallback`.
  if (env.allowedHd.length === 1) {
    params.hd = env.allowedHd[0];
  }

  const url = client.buildAuthorizationUrl(config, params);
  return { url: url.href, state, codeVerifier, nonce };
}

export interface VerifiedClaims {
  email: string;
  name: string | null;
  picture: string | null;
}

export class OidcExchangeError extends Error {
  constructor(
    message: string,
    readonly code:
      | "domain_not_allowed"
      | "email_not_verified"
      | "missing_email"
      | "state_mismatch"
      | "exchange_failed"
      | "config_missing",
  ) {
    super(message);
    this.name = "OidcExchangeError";
  }
}

/**
 * Validate the callback URL against the stored PKCE/state/nonce, exchange the
 * code for tokens, and return the claims we trust. Throws `OidcExchangeError`
 * with a typed reason on any rejection.
 */
export async function exchangeCallback(
  callbackUrl: URL,
  pending: { state: string; codeVerifier: string; nonce: string },
): Promise<VerifiedClaims> {
  const loaded = await loadOidcConfig();
  if (!loaded) {
    throw new OidcExchangeError("OIDC env not configured", "config_missing");
  }
  const { config, env } = loaded;

  let tokens;
  try {
    tokens = await client.authorizationCodeGrant(config, callbackUrl, {
      pkceCodeVerifier: pending.codeVerifier,
      expectedState: pending.state,
      expectedNonce: pending.nonce,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "exchange failed";
    if (msg.toLowerCase().includes("state")) {
      throw new OidcExchangeError(msg, "state_mismatch");
    }
    throw new OidcExchangeError(msg, "exchange_failed");
  }

  const claims = tokens.claims();
  if (!claims) {
    throw new OidcExchangeError("ID token had no claims", "exchange_failed");
  }
  const email = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : "";
  if (!email) {
    throw new OidcExchangeError("ID token missing email", "missing_email");
  }
  if (claims.email_verified === false) {
    throw new OidcExchangeError("Google email not verified", "email_not_verified");
  }
  if (env.allowedHd.length > 0) {
    const hd = typeof claims.hd === "string" ? claims.hd.trim().toLowerCase() : "";
    if (!hd || !env.allowedHd.includes(hd)) {
      throw new OidcExchangeError(
        `Sign-in restricted to ${env.allowedHd.join(", ")}`,
        "domain_not_allowed",
      );
    }
  }

  return {
    email,
    name: typeof claims.name === "string" ? claims.name : null,
    picture: typeof claims.picture === "string" ? claims.picture : null,
  };
}
