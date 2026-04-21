import { Router } from "express";
import { handleSlashCommand } from "./handler.js";

const router = Router();

// POST /slack/events — slash command endpoint
router.post("/events", handleSlashCommand);

export default router;
