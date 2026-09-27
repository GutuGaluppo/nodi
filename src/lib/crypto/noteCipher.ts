import { base64ToBytes, bytesToBase64 } from "./base64";

/**
 * Encryption for private notes, built only on the platform's Web Crypto API.
 *
 * A random 256-bit AES-GCM note key encrypts every private note. A
 * key-encryption key derived from the password (PBKDF2-SHA-256) wraps the note
 * key for storage, so the password itself is never stored. A recovery key can
 * wrap the same note key a second time. Each note is sealed
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

/**
 * Derives the key that wraps the note key from a recovery key. The recovery
 * key is already 160 random bits, so a fast HKDF is enough: there is nothing
 * to slow down a guess against.
 */
async function deriveRecoveryKeyEncryptionKey(
  recoveryKey: Uint8Array,
  salt: Uint8Array,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    asBuffer(recoveryKey),
    "HKDF",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: asBuffer(salt),
      info: asBuffer(new TextEncoder().encode("NODI recovery key v1")),
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["wrapKey", "unwrapKey"],
  );
}

async function wrapWith(
  key: CryptoKey,
  kek: CryptoKey,
  salt: Uint8Array,
): Promise<WrappedNoteKey> {
  const iv = randomBytes(IV_BYTES);
  const wrappedKey = await crypto.subtle.wrapKey("raw", key, kek, {
    name: "AES-GCM",
    iv: asBuffer(iv),
  });
  return {
    v: ENVELOPE_VERSION,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    wrappedKey: bytesToBase64(new Uint8Array(wrappedKey)),
  };
}

function unwrapWith(
  kek: CryptoKey,
  wrapped: WrappedNoteKey,
  extractable: boolean,
): Promise<CryptoKey> {
  return crypto.subtle.unwrapKey(
    "raw",
    asBuffer(base64ToBytes(wrapped.wrappedKey)),
    kek,
    { name: "AES-GCM", iv: asBuffer(base64ToBytes(wrapped.iv)) },
    { name: "AES-GCM", length: 256 },
    extractable,
    ["encrypt", "decrypt"],
  );
}

/** Wraps an extractable note key with a password, for storage. */
export async function wrapNoteKey(
  key: CryptoKey,
  password: string,
): Promise<WrappedNoteKey> {
  const salt = randomBytes(16);
  return wrapWith(key, await deriveKeyEncryptionKey(password, salt), salt);
}

/** Wraps an extractable note key with a recovery key, for storage. */
export async function wrapNoteKeyWithRecoveryKey(
  key: CryptoKey,
  recoveryKey: Uint8Array,
): Promise<WrappedNoteKey> {
  const salt = randomBytes(16);
  return wrapWith(
    key,
    await deriveRecoveryKeyEncryptionKey(recoveryKey, salt),
    salt,
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
  const wrapped = await wrapNoteKey(extractable, password);
  // The session only ever holds a non-extractable copy of the key.
  return { key: await unwrapNoteKey(password, wrapped), wrapped };
}

/**
 * Unwraps the stored note key. Rejects when the password is wrong. Only a
 * key that is about to be wrapped again should be extractable.
 */
export async function unwrapNoteKey(
  password: string,
  wrapped: WrappedNoteKey,
  extractable = false,
): Promise<CryptoKey> {
  const kek = await deriveKeyEncryptionKey(
    password,
    base64ToBytes(wrapped.salt),
  );
  return unwrapWith(kek, wrapped, extractable);
}

/** Unwraps the note key with a recovery key. Rejects when the key is wrong. */
export async function unwrapNoteKeyWithRecoveryKey(
  recoveryKey: Uint8Array,
  wrapped: WrappedNoteKey,
  extractable = false,
): Promise<CryptoKey> {
  const kek = await deriveRecoveryKeyEncryptionKey(
    recoveryKey,
    base64ToBytes(wrapped.salt),
  );
  return unwrapWith(kek, wrapped, extractable);
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
