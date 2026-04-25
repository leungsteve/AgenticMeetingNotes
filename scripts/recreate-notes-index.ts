/**
 * recreate-notes-index
 *
 * Drops and recreates the `granola-meeting-notes` index. Use ONLY when the
 * index mapping needs a structural change that Elasticsearch cannot apply
 * in-place (e.g., changing `summary_embedding` from 384 to 1024 dims).
 *
 * Behavior:
 *   - Without --force: prints the current document count and exits.
 *   - With --force:    deletes the index. Re-run `npm run setup:elastic`
 *                      afterwards to recreate from `elastic-mappings.json`,
 *                      then re-seed (`npm run demo:all` or your own ingest).
 *
 * Backup option:
 *   - Pass `--backup` to first reindex into a timestamped backup index
 *     before dropping. Use this if you have docs you may want to restore.
 */
import "dotenv/config";
import { errors } from "@elastic/elasticsearch";
import { createElasticsearchClientFromEnv } from "../src/server/config/elastic-client.js";
import { NOTES_INDEX } from "../src/server/constants/elastic.js";

const FORCE = process.argv.includes("--force");
const BACKUP = process.argv.includes("--backup");

async function main(): Promise<void> {
  if (!process.env.ELASTIC_CLOUD_ID?.trim() || !process.env.ELASTIC_API_KEY?.trim()) {
    console.error("Missing ELASTIC_CLOUD_ID or ELASTIC_API_KEY.");
    process.exit(1);
  }
  const client = createElasticsearchClientFromEnv();

  let count = 0;
  try {
    const res = await client.count({ index: NOTES_INDEX });
    count = res.count;
  } catch (err) {
    if (err instanceof errors.ResponseError && err.meta.statusCode === 404) {
      console.log(`Index "${NOTES_INDEX}" does not exist. Nothing to do.`);
      return;
    }
    throw err;
  }

  console.log(`Index "${NOTES_INDEX}" currently has ${count} document(s).`);

  if (!FORCE) {
    console.log(
      "\nThis script will DELETE the index. Re-run with --force to proceed.\n" +
        "  Optional: --backup to first reindex into a timestamped backup index.\n",
    );
    return;
  }

  if (BACKUP && count > 0) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backup = `${NOTES_INDEX}-backup-${stamp.toLowerCase()}`;
    console.log(`Reindexing ${count} doc(s) → ${backup} ...`);
    await client.indices.create({ index: backup });
    await client.reindex({
      refresh: true,
      source: { index: NOTES_INDEX },
      dest: { index: backup },
    });
    console.log(`  ✓ backup created: ${backup}`);
  } else if (count > 0) {
    console.log(`Skipping backup (--backup not specified). ${count} doc(s) will be lost.`);
  }

  console.log(`Deleting index "${NOTES_INDEX}" ...`);
  await client.indices.delete({ index: NOTES_INDEX });
  console.log(`  ✓ deleted`);

  console.log("\nNext: npm run setup:elastic    # recreate with current mappings");
  console.log("Then: npm run demo:all          # re-seed end-to-end\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
