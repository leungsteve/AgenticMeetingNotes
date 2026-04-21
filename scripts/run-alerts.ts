import "dotenv/config";
import { runAlertsWorker } from "../src/server/workers/alerts-worker.js";

runAlertsWorker()
  .then(() => process.exit(0))
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  });
