import "dotenv/config";
import { runEvalHarness } from "../src/server/workers/eval-harness.js";

const agentUrl = process.env.AGENT_BUILDER_URL ?? "";
const apiKey = process.env.AGENT_BUILDER_API_KEY ?? "";

runEvalHarness(agentUrl, apiKey)
  .then(() => process.exit(0))
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  });
