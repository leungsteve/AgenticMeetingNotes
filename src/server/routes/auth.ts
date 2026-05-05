import { Router, type Request, type Response } from "express";
import { isAdminEmail } from "../auth/admins.js";
import { attachUser, multiUserEnabled, requireUser } from "../auth/middleware.js";
import {
  buildGoogleAuthRedirect,
  exchangeCallback,
  loadOidcConfig,
  OidcExchangeError,
} from "../auth/oidc.js";
import {
  demoPinMatches,
  displayNameFromEmail,
  getClientAuthMode,
  isDemoAuthMode,
  isDemoEmailAllowed,
  parseDemoAuthEmails,
} from "../auth/mode.js";
import { resolveUserScope } from "../auth/scope.js";
import type { OidcPendingState, SessionUser } from "../auth/types.js";

const router = Router();

/** Cap on the number of pursuit-team accounts surfaced through /api/me. */
const ME_SCOPE_ACCOUNT_PREVIEW_LIMIT = 50;

interface SessionShape {
  user?: SessionUser;
  oidc?: OidcPendingState;
}

function getAppOrigin(): string {
  return (process.env.APP_ORIGIN ?? "http://localhost:5173").replace(/\/+$/, "");
}

/** Validate that a `returnTo` value is a same-origin path before redirecting. */
function safeReturnTo(raw: string | undefined): string {
  if (!raw) return "/";
  // Only allow relative paths starting with a single "/" — block protocol-relative
  // URLs like "//evil.com" and absolute URLs like "https://evil.com".
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

router.get("/google/start", async (req: Request, res: Response) => {
  if (!multiUserEnabled()) {
    res.status(409).json({
      error:
        "Multi-user mode is disabled (MULTI_USER=false). Set MULTI_USER=true and restart the server to enable Google sign-in.",
    });
    return;
  }
  if (isDemoAuthMode()) {
    res.status(409).json({
      error:
        "Demo authentication is enabled (AUTH_MODE=demo). Use the PIN sign-in form in the app — Google OIDC is disabled for this deployment.",
    });
    return;
  }
  const redirect = await buildGoogleAuthRedirect(safeReturnTo(req.query.returnTo as string));
  if (!redirect) {
    res.status(503).json({
      error:
        "Google OIDC is not configured. Set GOOGLE_OIDC_CLIENT_ID, GOOGLE_OIDC_CLIENT_SECRET, GOOGLE_OIDC_REDIRECT_URI in .env.",
    });
    return;
  }
  const session = req.session as SessionShape;
  session.oidc = {
    state: redirect.state,
    codeVerifier: redirect.codeVerifier,
    nonce: redirect.nonce,
    returnTo: safeReturnTo(req.query.returnTo as string),
  };
  res.redirect(redirect.url);
});

/** Redirect failed sign-ins back to the client with the message URL-encoded
 * so the React app can render a useful error instead of a raw JSON body. */
function redirectLoginError(res: Response, message: string, code?: string): void {
  const params = new URLSearchParams({ login_error: message });
  if (code) params.set("login_error_code", code);
  res.redirect(`${getAppOrigin()}/?${params.toString()}`);
}

router.get("/google/callback", async (req: Request, res: Response) => {
  if (!multiUserEnabled()) {
    redirectLoginError(res, "Multi-user mode is disabled", "multi_user_disabled");
    return;
  }
  if (isDemoAuthMode()) {
    redirectLoginError(res, "Demo mode uses PIN sign-in, not Google", "demo_mode_active");
    return;
  }
  const session = req.session as SessionShape;
  const pending = session.oidc;
  if (!pending) {
    redirectLoginError(res, "No pending login — start at /auth/google/start", "no_pending_state");
    return;
  }

  const callbackUrl = new URL(req.originalUrl, `${req.protocol}://${req.get("host")}`);

  try {
    const claims = await exchangeCallback(callbackUrl, pending);
    session.user = {
      email: claims.email,
      name: claims.name,
      picture: claims.picture,
      isAdmin: isAdminEmail(claims.email),
    };
    session.oidc = undefined;
    const target = `${getAppOrigin()}${pending.returnTo ?? "/"}`;
    res.redirect(target);
  } catch (e) {
    session.oidc = undefined;
    if (e instanceof OidcExchangeError) {
      redirectLoginError(res, e.message, e.code);
      return;
    }
    // eslint-disable-next-line no-console
    console.error("[auth] callback failure:", e);
    redirectLoginError(res, "Login failed — see server logs", "internal_error");
  }
});

router.post("/logout", (req: Request, res: Response) => {
  const session = req.session as SessionShape;
  session.user = undefined;
  session.oidc = undefined;
  res.json({ ok: true });
});

/** Public: allowlisted demo personas for the PIN sign-in UI (AUTH_MODE=demo only). */
router.get("/demo/config", (_req: Request, res: Response) => {
  if (!isDemoAuthMode()) {
    res.status(404).json({ error: "Demo auth is not enabled" });
    return;
  }
  const personas = parseDemoAuthEmails().map((email) => ({
    email,
    name: displayNameFromEmail(email),
  }));
  res.json({ personas });
});

/** PIN + allowlisted email → session cookie. For MVP / stakeholder demos only. */
router.post("/demo/login", (req: Request, res: Response) => {
  if (!isDemoAuthMode()) {
    res.status(404).json({ error: "Demo auth is not enabled" });
    return;
  }
  const emailRaw = typeof req.body?.email === "string" ? req.body.email : "";
  const pinRaw = typeof req.body?.pin === "string" ? req.body.pin : "";
  const email = emailRaw.trim().toLowerCase();
  if (!email || !isDemoEmailAllowed(email)) {
    res.status(401).json({ error: "Unknown email or incorrect PIN" });
    return;
  }
  if (!demoPinMatches(pinRaw)) {
    res.status(401).json({ error: "Unknown email or incorrect PIN" });
    return;
  }
  const session = req.session as SessionShape;
  session.oidc = undefined;
  session.user = {
    email,
    name: displayNameFromEmail(email),
    picture: null,
    isAdmin: isAdminEmail(email),
  };
  res.json({ ok: true, auth_mode: getClientAuthMode() });
});

/** Quick health check that confirms OIDC discovery succeeds (admin-only later). */
router.get("/google/healthz", async (_req: Request, res: Response) => {
  const loaded = await loadOidcConfig();
  res.json({ ok: !!loaded, configured: !!loaded });
});

const meRouter = Router();

/** Returns the verified user's identity + a summary of their data scope, or 401. */
meRouter.get("/", attachUser, async (req: Request, res: Response) => {
  if (!req.user) {
    res.status(401).json({
      error: "Not authenticated",
      auth_mode: getClientAuthMode(),
      ...(isDemoAuthMode() ? {} : { login_url: "/auth/google/start" }),
    });
    return;
  }
  // Resolving scope makes a couple of ES queries; surfacing it here lets
  // the UI render a "your visibility" panel without a second roundtrip.
  // For admins (incl. the dev fallback user) the arrays are empty and the
  // counts are reported as null to mean "everything".
  let pursuitAccountsPreview: string[] = [];
  let pursuitAccountsTotal = 0;
  let visibleAccountsCount: number | null = null;
  let visibleOppIdsCount: number | null = null;
  try {
    const scope = await resolveUserScope(req.user);
    if (!scope.isAdmin) {
      pursuitAccountsTotal = scope.pursuitAccounts.length;
      pursuitAccountsPreview = scope.pursuitAccounts.slice(0, ME_SCOPE_ACCOUNT_PREVIEW_LIMIT);
      visibleAccountsCount = scope.visibleAccounts.length;
      visibleOppIdsCount = scope.visibleOppIds.length;
    }
  } catch (e) {
    // Don't fail /api/me if scope resolution misses (e.g. ES briefly down);
    // the UI will still render with `null` counts.
    // eslint-disable-next-line no-console
    console.warn("[auth] /api/me could not resolve scope:", e);
  }
  res.json({
    email: req.user.email,
    name: req.user.name,
    picture: req.user.picture,
    isAdmin: req.user.isAdmin,
    multi_user: multiUserEnabled(),
    auth_mode: getClientAuthMode(),
    scope: {
      is_admin: req.user.isAdmin,
      pursuit_accounts: pursuitAccountsPreview,
      pursuit_accounts_count: pursuitAccountsTotal,
      pursuit_accounts_truncated: pursuitAccountsTotal > pursuitAccountsPreview.length,
      visible_accounts_count: visibleAccountsCount,
      visible_opp_ids_count: visibleOppIdsCount,
    },
  });
});

export { router as authRouter, meRouter, requireUser };
