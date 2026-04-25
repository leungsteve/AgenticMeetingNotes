import { computeAllRollups } from "./rollup-worker.js";
import { runAlertsWorker } from "./alerts-worker.js";
import { runFridayDigest } from "./friday-digest-worker.js";

const NIGHTLY_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const STARTUP_DELAY_MS = 30 * 1000; // 30 seconds after boot
const DIGEST_HOUR = 16; // 16:00 local
const DIGEST_DAY = 5; // Friday (Sun=0)

let rollupTimer: ReturnType<typeof setInterval> | null = null;
let alertsTimer: ReturnType<typeof setInterval> | null = null;
let digestTimer: ReturnType<typeof setTimeout> | null = null;

function msUntilNextFridayAt(hour: number): number {
  const now = new Date();
  const next = new Date(now);
  const dayDelta = (DIGEST_DAY - now.getDay() + 7) % 7;
  next.setDate(now.getDate() + dayDelta);
  next.setHours(hour, 0, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 7);
  }
  return next.getTime() - now.getTime();
}

function scheduleNextDigest(): void {
  const wait = msUntilNextFridayAt(DIGEST_HOUR);
  digestTimer = setTimeout(async () => {
    try {
      await runFridayDigest();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[scheduler] Friday digest failed:", e);
    } finally {
      scheduleNextDigest();
    }
  }, wait);
  // eslint-disable-next-line no-console
  console.log(
    `[scheduler] Next Friday digest scheduled in ${Math.round(wait / 1000 / 60)} minutes (target: Fri ${DIGEST_HOUR}:00 local).`,
  );
}

export function startScheduler(): void {
  // Run rollup after 30s startup delay, then every 24h
  setTimeout(async () => {
    try {
      await computeAllRollups();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[scheduler] Initial rollup failed:", e);
    }
    rollupTimer = setInterval(async () => {
      try {
        await computeAllRollups();
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("[scheduler] Rollup failed:", e);
      }
    }, NIGHTLY_INTERVAL_MS);
  }, STARTUP_DELAY_MS);

  // Run alerts after 60s, then every 24h
  setTimeout(async () => {
    try {
      await runAlertsWorker();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[scheduler] Initial alerts failed:", e);
    }
    alertsTimer = setInterval(async () => {
      try {
        await runAlertsWorker();
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("[scheduler] Alerts failed:", e);
      }
    }, NIGHTLY_INTERVAL_MS);
  }, 60 * 1000);

  scheduleNextDigest();

  // eslint-disable-next-line no-console
  console.log(
    "[scheduler] Background workers scheduled (rollup: +30s, alerts: +60s, then nightly; Friday digest at 16:00 local)",
  );
}

export function stopScheduler(): void {
  if (rollupTimer) clearInterval(rollupTimer);
  if (alertsTimer) clearInterval(alertsTimer);
  if (digestTimer) clearTimeout(digestTimer);
}
