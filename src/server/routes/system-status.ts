import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import { getElastic } from "../elastic-instance.js";

const router = Router();

function elasticEndpointPreview(raw: string | undefined): string {
  if (!raw?.trim()) return "";
  const s = raw.trim();
  if (/^https?:\/\//i.test(s)) {
    try {
      return new URL(s).host;
    } catch {
      return "configured";
    }
  }
  const idx = s.indexOf(":");
  return idx > 0 ? s.slice(0, idx) : s.slice(0, 24);
}

router.get("/", async (_req, res) => {
  let elasticOk = false;
  try {
    elasticOk = await getElastic().ping();
  } catch {
    elasticOk = false;
  }

  const drivePath = process.env.DRIVE_NOTES_PATH?.trim() ?? "";
  let driveExists = false;
  if (drivePath) {
    try {
      driveExists = fs.existsSync(path.resolve(drivePath));
    } catch {
      driveExists = false;
    }
  }

  res.json({
    elastic: {
      ok: elasticOk,
      endpoint_preview: elasticEndpointPreview(process.env.ELASTIC_CLOUD_ID),
    },
    drive: {
      path: drivePath,
      configured: Boolean(drivePath),
      exists: driveExists,
    },
  });
});

router.post("/validate-drive", (req, res) => {
  const raw = typeof req.body?.path === "string" ? req.body.path.trim() : "";
  const drivePath = raw || process.env.DRIVE_NOTES_PATH?.trim() || "";
  if (!drivePath) {
    res.status(400).json({ exists: false, error: "No path provided and DRIVE_NOTES_PATH is unset." });
    return;
  }
  try {
    const resolved = path.resolve(drivePath);
    const exists = fs.existsSync(resolved);
    res.json({ exists, resolved });
  } catch (e) {
    res.status(400).json({
      exists: false,
      error: e instanceof Error ? e.message : "Invalid path",
    });
  }
});

export default router;
