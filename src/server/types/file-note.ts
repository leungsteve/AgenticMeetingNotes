import type { IngestNoteInput } from "./ingest-note.js";

/** Everything needed to render the Drive Markdown file. */
export interface NoteFilePayload extends IngestNoteInput {
  version: number;
  ingested_at?: string | null;
}
