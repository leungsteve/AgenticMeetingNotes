import "dotenv/config";
import { computeAllRollups } from "../src/server/workers/rollup-worker.js";
import { computeAllOpportunityRollups } from "../src/server/workers/opportunity-rollup-worker.js";

async function main(): Promise<void> {
  await computeAllRollups();
  await computeAllOpportunityRollups();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  });
