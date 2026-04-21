import "dotenv/config";
import { computeAllRollups } from "../src/server/workers/rollup-worker.js";

computeAllRollups()
  .then(() => process.exit(0))
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  });
