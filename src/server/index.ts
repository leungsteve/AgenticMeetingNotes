import "dotenv/config";
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
import { createAgentRouter } from "./agent/index.js";
import slackRouter from "./integrations/slack/router.js";
import { startScheduler } from "./workers/scheduler.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.use(cors());
app.use(express.json({ limit: "20mb" }));
app.use("/slack", express.urlencoded({ extended: true }));
app.use("/slack", slackRouter);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "granola-elastic-pipeline" });
});

app.use("/api", createAgentRouter());

app.use("/api/system-status", systemStatusRouter);
app.use("/api/notes", notesRouter);
app.use("/api/ingested", ingestedRouter);
app.use("/api/ingest", ingestRouter);
app.use("/api/team-members", teamRouter);
app.use("/api/lookups", lookupsRouter);
app.use("/api/sync-status", syncStatusRouter);
app.use("/api/accounts", accountsRouter);
app.use("/api/rollups", rollupsRouter);
app.use("/api/alerts", alertsRouter);
app.use("/api/action-items", actionItemsRouter);
app.use("/api/feedback", feedbackRouter);
app.use("/api/agent-actions", agentActionsRouter);
app.use("/api/chat", chatRouter);
app.use("/api/opportunities", opportunitiesRouter);
app.use("/api/risk-tracker", riskTrackerRouter);
app.use("/api/digest", digestRouter);

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
  console.log(`API server listening on http://127.0.0.1:${PORT}`);
  startScheduler();
});
