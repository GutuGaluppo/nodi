/**
 * Globally unique identifiers for every persisted NODI record.
 *
 * NODI uses UUID version 7: a 48-bit big-endian Unix millisecond timestamp
 * followed by 74 random bits, laid out in the canonical 8-4-4-4-12 hex form.
 * The leading timestamp makes freshly created identifiers sort in creation
 * order, which keeps list queries and future sync reconciliation simple, while
 * the random tail keeps them unguessable and collision-free across devices.
 *
 * The decision between UUID v7 and ULID is recorded in docs/DECISIONS.md.
 */
export function createId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  const timestamp = Date.now();
  bytes[0] = Math.floor(timestamp / 2 ** 40) % 256;
  bytes[1] = Math.floor(timestamp / 2 ** 32) % 256;
  bytes[2] = Math.floor(timestamp / 2 ** 24) % 256;
  bytes[3] = Math.floor(timestamp / 2 ** 16) % 256;
  bytes[4] = Math.floor(timestamp / 2 ** 8) % 256;
  bytes[5] = timestamp % 256;

  // Version 7 in the high nibble of byte 6, variant 0b10 in the top bits of byte 8.
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
