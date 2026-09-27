import { base64ToBytes, bytesToBase64 } from "../../lib/crypto/base64";

/** Stores a vector compactly: little-endian float32, base64-encoded. */
export function encodeVector(vector: number[]): string {
  const floats = Float32Array.from(vector);
  return bytesToBase64(new Uint8Array(floats.buffer));
}

export function decodeVector(encoded: string): Float32Array {
  if (encoded === "") return new Float32Array();
  const bytes = base64ToBytes(encoded);
  return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
}

export interface NoteVector {
  noteId: string;
  title: string;
  language: string | null;
  vector: Float32Array;
}

export interface RelatedNote {
  noteId: string;
  title: string;
  score: number;
}

function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return normA === 0 || normB === 0 ? 0 : dot / Math.sqrt(normA * normB);
}

/**
 * The notes most similar to `noteId`, best first. Only notes embedded in the
 * same language are compared, since vectors from different languages live in
 * different spaces.
 *
 * Calibrated on NaturalLanguage sentence embeddings: related notes scored
 * 0.68–0.76 while unrelated ones reached 0.58, so a fixed cutoff alone lets
 * noise through. A note is kept when it scores at least `minScore` and within
 * `margin` of the best match.
 */
export function findRelated(
  noteId: string,
  vectors: NoteVector[],
  limit = 5,
  minScore = 0.5,
  margin = 0.12,
): RelatedNote[] {
  const target = vectors.find((item) => item.noteId === noteId);
  if (!target || target.language === null || target.vector.length === 0) {
    return [];
  }
  return vectors
    .filter(
      (item) =>
        item.noteId !== noteId &&
        item.language === target.language &&
        item.vector.length === target.vector.length,
    )
    .map((item) => ({
      noteId: item.noteId,
      title: item.title,
      score: cosine(target.vector, item.vector),
    }))
    .filter((item) => item.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .filter((item, _, ranked) => item.score >= ranked[0].score - margin)
    .slice(0, limit);
}
