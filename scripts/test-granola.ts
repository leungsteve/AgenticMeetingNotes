import "dotenv/config";
import { GranolaClient } from "../src/server/services/granola.js";

async function main(): Promise<void> {
  const client = GranolaClient.fromEnv();
  const notes = await client.listNotes();
  // eslint-disable-next-line no-console
  console.log(`Granola OK: listed ${notes.length} note(s).`);
  if (notes[0]) {
    // eslint-disable-next-line no-console
    console.log(`Sample note id: ${notes[0].id}`);
  }
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
