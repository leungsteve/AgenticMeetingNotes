import type { NextFunction, Request, Response } from "express";
import type { SessionUser } from "./types.js";
import { isAdminEmail } from "./admins.js";

/** Are we enforcing multi-user auth, or running in legacy single-user dev mode? */
export function multiUserEnabled(): boolean {
  return (process.env.MULTI_USER ?? "").trim().toLowerCase() === "true";
}

/**
 * In single-user dev mode we still want routes to feel as if a user is
 * present (so handlers can read `req.user`). We synthesize a permissive dev
 * user from `DEV_USER_EMAIL` (or fall back to "dev@local") and grant admin.
 */
function devFallbackUser(): SessionUser {
  const email = (process.env.DEV_USER_EMAIL ?? "dev@local").trim().toLowerCase();
  return {
    email,
    name: "Dev",
    picture: null,
    isAdmin: true,
  };
}

/**
 * Attach the verified user to `req.user` if a session exists. Never blocks.
 * Useful for routes that work both authenticated and anonymous.
 */
export function attachUser(req: Request, _res: Response, next: NextFunction): void {
  const sessionUser = (req.session as { user?: SessionUser } | undefined)?.user;
  if (sessionUser) {
    req.user = { ...sessionUser, isAdmin: isAdminEmail(sessionUser.email) };
  } else if (!multiUserEnabled()) {
    req.user = devFallbackUser();
  }
  next();
}

/**
 * Block the request unless a verified user is present. In single-user dev
 * mode (`MULTI_USER=false`) this falls through with a synthesized dev user.
 */
export function requireUser(req: Request, res: Response, next: NextFunction): void {
  if (!multiUserEnabled()) {
    req.user = devFallbackUser();
    return next();
  }
  const sessionUser = (req.session as { user?: SessionUser } | undefined)?.user;
  if (!sessionUser) {
    res.status(401).json({ error: "Not authenticated", login_url: "/auth/google/start" });
    return;
  }
  req.user = { ...sessionUser, isAdmin: isAdminEmail(sessionUser.email) };
  next();
}

/** Block the request unless the verified user is an admin. */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  requireUser(req, res, () => {
    if (!req.user?.isAdmin) {
      res.status(403).json({ error: "Admin only" });
      return;
    }
    next();
  });
}
