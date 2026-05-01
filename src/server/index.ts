import "dotenv/config";
import cookieSession from "cookie-session";
import cors from "cors";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import accountsRouter from "./routes/accounts.js";
import actionItemsRouter from "./routes/action-items.js";
import agentActionsRouter from "./routes/agent-actions.js";
import alertsRouter from "./routes/alerts.js";
import chatRouter from "./routes/chat.js";
import digestRouter from "./routes/digest.js";
import feedbackRouter from "./routes/feedback.js";
import ingestedRouter from "./routes/ingested.js";
import ingestRouter from "./routes/ingest.js";
import lookupsRouter from "./routes/lookups.js";
import notesRouter from "./routes/notes.js";
import opportunitiesRouter from "./routes/opportunities.js";
import riskTrackerRouter from "./routes/risk-tracker.js";
import rollupsRouter from "./routes/rollups.js";
import syncStatusRouter from "./routes/sync-status.js";
import systemStatusRouter from "./routes/system-status.js";
import teamRouter from "./routes/team.js";
import { authRouter, meRouter } from "./routes/auth.js";
import { multiUserEnabled, requireUser } from "./auth/middleware.js";
import { createAgentRouter } from "./agent/index.js";
import slackRouter from "./integrations/slack/router.js";
import { startScheduler } from "./workers/scheduler.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT) || 3001;
const APP_ORIGIN = (process.env.APP_ORIGIN ?? "http://localhost:5173").replace(/\/+$/, "");
const MULTI_USER = multiUserEnabled();

if (MULTI_USER && !process.env.SESSION_SECRET) {
  // eslint-disable-next-line no-console
  console.error(
    "[auth] MULTI_USER=true but SESSION_SECRET is not set — refusing to start. Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
  );
  process.exit(1);
}

if (MULTI_USER) {
  app.use(
    cors({
      origin: APP_ORIGIN,
      credentials: true,
    }),
  );
} else {
  // Legacy single-user dev: keep CORS permissive so existing setups don't break.
  app.use(cors());
}
app.use(express.json({ limit: "20mb" }));
app.use(
  cookieSession({
    name: "amn_session",
    keys: [process.env.SESSION_SECRET ?? "dev-only-insecure-secret"],
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    httpOnly: true,
    sameSite: "lax",
    secure: APP_ORIGIN.startsWith("https://"),
  }),
);

app.use("/slack", express.urlencoded({ extended: true }));
app.use("/slack", slackRouter);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "granola-elastic-pipeline" });
});

// Public auth routes (login, callback, logout, /api/me).
app.use("/auth", authRouter);
app.use("/api/me", meRouter);

// Everything below requires a verified user (or, in single-user dev mode,
// `requireUser` synthesizes a permissive dev user so local flows still work).
app.use("/api", requireUser, createAgentRouter());

app.use("/api/system-status", requireUser, systemStatusRouter);
app.use("/api/notes", requireUser, notesRouter);
app.use("/api/ingested", requireUser, ingestedRouter);
app.use("/api/ingest", requireUser, ingestRouter);
app.use("/api/team-members", requireUser, teamRouter);
app.use("/api/lookups", requireUser, lookupsRouter);
app.use("/api/sync-status", requireUser, syncStatusRouter);
app.use("/api/accounts", requireUser, accountsRouter);
app.use("/api/rollups", requireUser, rollupsRouter);
app.use("/api/alerts", requireUser, alertsRouter);
app.use("/api/action-items", requireUser, actionItemsRouter);
app.use("/api/feedback", requireUser, feedbackRouter);
app.use("/api/agent-actions", requireUser, agentActionsRouter);
app.use("/api/chat", requireUser, chatRouter);
app.use("/api/opportunities", requireUser, opportunitiesRouter);
app.use("/api/risk-tracker", requireUser, riskTrackerRouter);
app.use("/api/digest", requireUser, digestRouter);

const clientDist = path.resolve(__dirname, "../../dist/client");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(clientDist, "index.html"), (err) => {
      if (err) next();
    });
  });
}

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(
    `API server listening on http://127.0.0.1:${PORT} (multi_user=${MULTI_USER}, app_origin=${APP_ORIGIN})`,
  );
  startScheduler();
});
