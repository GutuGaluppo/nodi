import { base64ToBytes, bytesToBase64 } from "./base64";

/**
 * Encryption for private notes, built only on the platform's Web Crypto API.
 *
 * A random 256-bit AES-GCM note key encrypts every private note. A
 * key-encryption key derived from the password (PBKDF2-SHA-256) wraps the note
 * key for storage, so the password itself is never stored. Each note is sealed
 * with a fresh IV and its id as additional authenticated data, which stops a
 * ciphertext from being moved onto another note.
 */

const PBKDF2_ITERATIONS = 210_000;
const IV_BYTES = 12;
const ENVELOPE_VERSION = 1;

export interface PrivateNotePayload {
  title: string;
  contentJson: string;
  contentText: string;
}

export interface WrappedNoteKey {
  v: number;
  salt: string;
  iv: string;
  wrappedKey: string;
}

interface Envelope {
  v: number;
  iv: string;
  ct: string;
}

function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

function asBuffer(bytes: Uint8Array): BufferSource {
  return bytes as unknown as BufferSource;
}

async function deriveKeyEncryptionKey(
  password: string,
  salt: Uint8Array,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: asBuffer(salt),
      iterations: PBKDF2_ITERATIONS,
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["wrapKey", "unwrapKey"],
  );
}

/** Creates a new note key and returns it with its password-wrapped form for storage. */
export async function createNoteKey(
  password: string,
): Promise<{ key: CryptoKey; wrapped: WrappedNoteKey }> {
  const extractable = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
  const salt = randomBytes(16);
  const iv = randomBytes(IV_BYTES);
  const kek = await deriveKeyEncryptionKey(password, salt);
  const wrappedKey = await crypto.subtle.wrapKey("raw", extractable, kek, {
    name: "AES-GCM",
    iv: asBuffer(iv),
  });
  const wrapped: WrappedNoteKey = {
    v: ENVELOPE_VERSION,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    wrappedKey: bytesToBase64(new Uint8Array(wrappedKey)),
  };
  // The session only ever holds a non-extractable copy of the key.
  return { key: await unwrapNoteKey(password, wrapped), wrapped };
}

/** Unwraps the stored note key. Rejects when the password is wrong. */
export async function unwrapNoteKey(
  password: string,
  wrapped: WrappedNoteKey,
): Promise<CryptoKey> {
  const kek = await deriveKeyEncryptionKey(
    password,
    base64ToBytes(wrapped.salt),
  );
  return crypto.subtle.unwrapKey(
    "raw",
    asBuffer(base64ToBytes(wrapped.wrappedKey)),
    kek,
    { name: "AES-GCM", iv: asBuffer(base64ToBytes(wrapped.iv)) },
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptNotePayload(
  key: CryptoKey,
  noteId: string,
  payload: PrivateNotePayload,
): Promise<string> {
  const iv = randomBytes(IV_BYTES);
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: asBuffer(iv),
      additionalData: asBuffer(new TextEncoder().encode(noteId)),
    },
    key,
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  const envelope: Envelope = {
    v: ENVELOPE_VERSION,
    iv: bytesToBase64(iv),
    ct: bytesToBase64(new Uint8Array(ciphertext)),
  };
  return JSON.stringify(envelope);
}

/** Rejects when the key is wrong, the data was altered, or it belongs to another note. */
export async function decryptNotePayload(
  key: CryptoKey,
  noteId: string,
  sealed: string,
): Promise<PrivateNotePayload> {
  const envelope = JSON.parse(sealed) as Envelope;
  if (envelope.v !== ENVELOPE_VERSION) {
    throw new Error(`Unsupported private note format ${envelope.v}.`);
  }
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: asBuffer(base64ToBytes(envelope.iv)),
      additionalData: asBuffer(new TextEncoder().encode(noteId)),
    },
    key,
    asBuffer(base64ToBytes(envelope.ct)),
  );
  return JSON.parse(new TextDecoder().decode(plaintext)) as PrivateNotePayload;
}
