import { computeAllRollups } from "./rollup-worker.js";
import { runAlertsWorker } from "./alerts-worker.js";

const NIGHTLY_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const STARTUP_DELAY_MS = 30 * 1000; // 30 seconds after boot

let rollupTimer: ReturnType<typeof setInterval> | null = null;
let alertsTimer: ReturnType<typeof setInterval> | null = null;

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

  // eslint-disable-next-line no-console
  console.log("[scheduler] Background workers scheduled (rollup: +30s, alerts: +60s, then nightly)");
}

export function stopScheduler(): void {
  if (rollupTimer) clearInterval(rollupTimer);
  if (alertsTimer) clearInterval(alertsTimer);
}
