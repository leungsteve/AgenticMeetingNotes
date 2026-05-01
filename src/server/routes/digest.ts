import { Router } from "express";
import { getRequestScope } from "../auth/scope.js";
import { runFridayDigest } from "../workers/friday-digest-worker.js";

const router = Router();

/**
 * The Friday digest sweeps every opportunity for a manager (or AE) and is
 * therefore inherently broad. Non-admins can only run a digest scoped to
 * themselves (manager_email == scope.email OR owner_se_email == scope.email).
 * Admins may run it for anyone (useful for backfills or impersonation
 * during demos).
 */
router.post("/run", async (req, res) => {
  try {
    const scope = await getRequestScope(req);
    const body = (req.body ?? {}) as {
      manager_email?: string;
      owner_se_email?: string;
      reference_date?: string;
    };
    const managerEmail = body.manager_email?.trim().toLowerCase();
    const ownerSeEmail = body.owner_se_email?.trim().toLowerCase();
    if (!scope.isAdmin) {
      const matchesManager = managerEmail && managerEmail === scope.email;
      const matchesOwner = ownerSeEmail && ownerSeEmail === scope.email;
      if (!matchesManager && !matchesOwner) {
        return res.status(403).json({
          error: "You can only run the digest for yourself. Pass manager_email or owner_se_email matching your account.",
        });
      }
    }
    const result = await runFridayDigest({
      managerEmail: body.manager_email,
      ownerSeEmail: body.owner_se_email,
      referenceDate: body.reference_date,
    });
    res.json(result);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
    const msg = e instanceof Error ? e.message : "Failed to run digest";
    res.status(500).json({ error: msg });
  }
});

export default router;
