import { setPrivateNoteKey } from "../../db/privateNoteKey";
import { encryptPendingPrivateNotes } from "../../db/repositories/noteRepository";
import {
  getSetting,
  setSetting,
} from "../../db/repositories/settingsRepository";
import { base64ToBytes, bytesToBase64 } from "../../lib/crypto/base64";
import {
  createNoteKey,
  unwrapNoteKey,
  type WrappedNoteKey,
} from "../../lib/crypto/noteCipher";

const PASSWORD_SETTING = "private_notes_password";
const KEY_SETTING = "private_notes_key";
const ITERATIONS = 210_000;

interface PasswordVerifier {
  salt: string;
  hash: string;
}

async function deriveHash(password: string, salt: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: salt as unknown as BufferSource,
      iterations: ITERATIONS,
    },
    key,
    256,
  );
  return bytesToBase64(new Uint8Array(bits));
}

/** Creates the note key, stores it wrapped by the password, and opens the session. */
async function createAndStoreNoteKey(password: string): Promise<void> {
  const { key, wrapped } = await createNoteKey(password);
  await setSetting(KEY_SETTING, JSON.stringify(wrapped));
  setPrivateNoteKey(key);
}

/**
 * Encrypts private notes still stored in plaintext. A failure leaves those
 * notes readable and pending; it does not undo the unlock.
 */
async function encryptPendingNotes(): Promise<void> {
  try {
    await encryptPendingPrivateNotes();
  } catch (error) {
    console.error("NODI could not encrypt pending private notes", error);
  }
}

/**
 * Sets the private-notes password. Only a salted verifier and the
 * password-wrapped note key are stored; the password never reaches SQLite.
 * The key is stored before the verifier, so an interrupted setup can simply
 * run again without orphaning encrypted notes.
 */
export async function setPrivateNotesPassword(password: string): Promise<void> {
  await createAndStoreNoteKey(password);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const verifier: PasswordVerifier = {
    salt: bytesToBase64(salt),
    hash: await deriveHash(password, salt),
  };
  await setSetting(PASSWORD_SETTING, JSON.stringify(verifier));
  await encryptPendingNotes();
}

export async function hasPrivateNotesPassword(): Promise<boolean> {
  return (await getSetting(PASSWORD_SETTING)) !== null;
}

export async function verifyPrivateNotesPassword(
  password: string,
): Promise<boolean> {
  const stored = await getSetting(PASSWORD_SETTING);
  if (!stored) return false;
  const verifier = JSON.parse(stored) as PasswordVerifier;
  return (
    (await deriveHash(password, base64ToBytes(verifier.salt))) === verifier.hash
  );
}

/**
 * Checks the password and opens the private-notes session. Private notes from
 * before encryption existed get their key on this first unlock, and every
 * pending private note is encrypted. Returns false for a wrong password.
 */
export async function unlockPrivateNotes(password: string): Promise<boolean> {
  if (!(await verifyPrivateNotesPassword(password))) {
    return false;
  }
  const stored = await getSetting(KEY_SETTING);
  if (stored) {
    setPrivateNoteKey(
      await unwrapNoteKey(password, JSON.parse(stored) as WrappedNoteKey),
    );
  } else {
    await createAndStoreNoteKey(password);
  }
  await encryptPendingNotes();
  return true;
}
