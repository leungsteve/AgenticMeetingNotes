import { Router, type Request, type Response } from "express";
import { isAdminEmail } from "../auth/admins.js";
import { attachUser, multiUserEnabled, requireUser } from "../auth/middleware.js";
import {
  buildGoogleAuthRedirect,
  exchangeCallback,
  loadOidcConfig,
  OidcExchangeError,
} from "../auth/oidc.js";
import type { OidcPendingState, SessionUser } from "../auth/types.js";

const router = Router();

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

router.get("/google/callback", async (req: Request, res: Response) => {
  if (!multiUserEnabled()) {
    res.status(409).json({ error: "Multi-user mode is disabled" });
    return;
  }
  const session = req.session as SessionShape;
  const pending = session.oidc;
  if (!pending) {
    res.status(400).json({ error: "No pending login — start at /auth/google/start" });
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
      res.status(401).json({ error: e.message, code: e.code });
      return;
    }
    // eslint-disable-next-line no-console
    console.error("[auth] callback failure:", e);
    res.status(500).json({ error: "Login failed" });
  }
});

router.post("/logout", (req: Request, res: Response) => {
  const session = req.session as SessionShape;
  session.user = undefined;
  session.oidc = undefined;
  res.json({ ok: true });
});

/** Quick health check that confirms OIDC discovery succeeds (admin-only later). */
router.get("/google/healthz", async (_req: Request, res: Response) => {
  const loaded = await loadOidcConfig();
  res.json({ ok: !!loaded, configured: !!loaded });
});

const meRouter = Router();

/** Returns the verified user's identity, or 401 if no session. */
meRouter.get("/", attachUser, (req: Request, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: "Not authenticated", login_url: "/auth/google/start" });
    return;
  }
  res.json({
    email: req.user.email,
    name: req.user.name,
    picture: req.user.picture,
    isAdmin: req.user.isAdmin,
    multi_user: multiUserEnabled(),
  });
});

export { router as authRouter, meRouter, requireUser };
