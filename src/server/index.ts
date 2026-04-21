import "dotenv/config";
import cors from "cors";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ingestedRouter from "./routes/ingested.js";
import ingestRouter from "./routes/ingest.js";
import lookupsRouter from "./routes/lookups.js";
import notesRouter from "./routes/notes.js";
import syncStatusRouter from "./routes/sync-status.js";
import systemStatusRouter from "./routes/system-status.js";
import teamRouter from "./routes/team.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.use(cors());
app.use(express.json({ limit: "20mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "granola-elastic-pipeline" });
});

app.use("/api/system-status", systemStatusRouter);
app.use("/api/notes", notesRouter);
app.use("/api/ingested", ingestedRouter);
app.use("/api/ingest", ingestRouter);
app.use("/api/team-members", teamRouter);
app.use("/api/lookups", lookupsRouter);
app.use("/api/sync-status", syncStatusRouter);

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
});
