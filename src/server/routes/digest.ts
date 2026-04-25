import { Router } from "express";
import { runFridayDigest } from "../workers/friday-digest-worker.js";

const router = Router();

router.post("/run", async (req, res) => {
  try {
    const body = (req.body ?? {}) as {
      manager_email?: string;
      owner_se_email?: string;
      reference_date?: string;
    };
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
