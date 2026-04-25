import "dotenv/config";
import { runFridayDigest } from "../src/server/workers/friday-digest-worker.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const idx = args.findIndex((a) => a === flag || a.startsWith(`${flag}=`));
    if (idx === -1) return undefined;
    const arg = args[idx];
    if (arg.includes("=")) return arg.slice(arg.indexOf("=") + 1);
    return args[idx + 1];
  };

  const result = await runFridayDigest({
    managerEmail: get("--manager"),
    ownerSeEmail: get("--se"),
    referenceDate: get("--date"),
  });

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(result, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  });
