/**
 * Recovery keys for private notes: 160 random bits, shown to the user once as
 * eight groups of four Crockford base32 characters (no I, L, O or U, so they
 * are hard to misread when copied by hand).
 */

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const KEY_BYTES = 20;
const KEY_CHARACTERS = 32;
const GROUP = 4;

export function generateRecoveryKey(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(KEY_BYTES));
}

export function formatRecoveryKey(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let text = "";
  for (const byte of bytes) {
    value = ((value << 8) | byte) & 0xfff;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      text += ALPHABET[(value >> bits) & 31];
    }
  }
  return text.match(new RegExp(`.{1,${GROUP}}`, "g"))?.join("-") ?? "";
}

/**
 * Reads a recovery key as the user typed or pasted it: case, spaces and
 * dashes do not matter, and O, I and L are read as 0, 1 and 1. Returns null
 * when it cannot be a recovery key.
 */
export function parseRecoveryKey(input: string): Uint8Array | null {
  const text = input
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  if (text.length !== KEY_CHARACTERS) return null;
  const bytes = new Uint8Array(KEY_BYTES);
  let bits = 0;
  let value = 0;
  let index = 0;
  for (const character of text) {
    const digit = ALPHABET.indexOf(character);
    if (digit === -1) return null;
    value = ((value << 5) | digit) & 0xfff;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes[index] = (value >> bits) & 0xff;
      index += 1;
    }
  }
  return bytes;
}
