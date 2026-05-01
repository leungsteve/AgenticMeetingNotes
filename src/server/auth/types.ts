/**
 * Shape of the verified user we attach to every authenticated request.
 * Sourced from the Google ID token at `/auth/google/callback` and stored
 * in the signed session cookie.
 */
export interface SessionUser {
  email: string;
  name: string | null;
  picture: string | null;
  isAdmin: boolean;
}

/**
 * Transient OIDC state we keep in the session cookie between the redirect
 * to Google and the callback. Cleared on successful login.
 */
export interface OidcPendingState {
  state: string;
  codeVerifier: string;
  nonce: string;
  returnTo?: string;
}

/** Reasons we may reject a Google sign-in attempt. */
export type AuthRejectionReason =
  | "domain_not_allowed"
  | "email_not_verified"
  | "missing_email"
  | "state_mismatch"
  | "exchange_failed"
  | "config_missing";

declare global {
  namespace Express {
    interface Request {
      /** Populated by `requireUser` / `attachUser` middleware. */
      user?: SessionUser;
    }
  }
}
