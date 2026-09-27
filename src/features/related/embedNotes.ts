import { invoke } from "@tauri-apps/api/core";
import {
  listStaleNotes,
  saveEmbeddings,
} from "../../db/repositories/embeddingRepository";
import { encodeVector } from "./similarity";

interface EmbeddingResult {
  id: string;
  language: string | null;
  vector: number[];
}

export type Embed = (
  inputs: { id: string; text: string }[],
) => Promise<EmbeddingResult[]>;

/** Computes sentence embeddings with Apple's NaturalLanguage, on this Mac. */
export const embedWithNaturalLanguage: Embed = (inputs) =>
  invoke<EmbeddingResult[]>("embed_notes", { inputs });

const BATCH = 50;
const MAX_PASSES = 200;

/**
 * Embeds every note that is new or changed since its last embedding, in
 * batches. Notes in a language without sentence embeddings are stored with no
 * vector, so they are not retried until they change. Returns how many notes
 * were processed.
 */
export async function embedStaleNotes(
  embed: Embed = embedWithNaturalLanguage,
): Promise<number> {
  let processed = 0;
  // A cap, so a note that keeps changing mid-pass can never loop forever.
  for (let pass = 0; pass < MAX_PASSES; pass += 1) {
    const stale = await listStaleNotes(BATCH);
    if (stale.length === 0) return processed;
    const results = await embed(stale.map(({ id, text }) => ({ id, text })));
    const byId = new Map(results.map((result) => [result.id, result]));
    await saveEmbeddings(
      stale.map((note) => {
        const result = byId.get(note.id);
        return {
          noteId: note.id,
          language: result?.language ?? null,
          vector: result ? encodeVector(result.vector) : "",
          sourceUpdatedAt: note.updatedAt,
        };
      }),
    );
    processed += stale.length;
    if (stale.length < BATCH) return processed;
  }
  return processed;
}
