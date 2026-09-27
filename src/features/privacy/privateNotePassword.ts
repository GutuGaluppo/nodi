import {
  clearPrivateNoteKey,
  setPrivateNoteKey,
} from "../../db/privateNoteKey";
import {
  deleteEncryptedPrivateNotes,
  encryptPendingPrivateNotes,
} from "../../db/repositories/noteRepository";
import {
  deleteSetting,
  getSetting,
  setSetting,
} from "../../db/repositories/settingsRepository";
import { base64ToBytes, bytesToBase64 } from "../../lib/crypto/base64";
import {
  createNoteKey,
  unwrapNoteKey,
  unwrapNoteKeyWithRecoveryKey,
  type WrappedNoteKey,
  wrapNoteKey,
  wrapNoteKeyWithRecoveryKey,
} from "../../lib/crypto/noteCipher";
import {
  formatRecoveryKey,
  generateRecoveryKey,
  parseRecoveryKey,
} from "../../lib/crypto/recoveryKey";

const PASSWORD_SETTING = "private_notes_password";
const KEY_SETTING = "private_notes_key";
const RECOVERY_SETTING = "private_notes_recovery_key";
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
  await storeVerifier(password);
  await encryptPendingNotes();
}

async function storeVerifier(password: string): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const verifier: PasswordVerifier = {
    salt: bytesToBase64(salt),
    hash: await deriveHash(password, salt),
  };
  await setSetting(PASSWORD_SETTING, JSON.stringify(verifier));
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

/** A recovery key shown to the user, not stored until they have saved it. */
export interface RecoveryKeyDraft {
  /** The key as the user sees it, e.g. `7KQ2-M9XD-…`. */
  code: string;
  /** Stores it, replacing any earlier recovery key. */
  save: () => Promise<void>;
}

export async function hasRecoveryKey(): Promise<boolean> {
  return (await getSetting(RECOVERY_SETTING)) !== null;
}

/**
 * Makes a new recovery key that opens the same note key as the password.
 * Returns null for a wrong password. The note key is only extractable inside
 * this call; the draft holds nothing but the code and the wrapped key.
 */
export async function prepareRecoveryKey(
  password: string,
): Promise<RecoveryKeyDraft | null> {
  if (!(await verifyPrivateNotesPassword(password))) return null;
  const stored = await getSetting(KEY_SETTING);
  if (!stored) return null;
  const key = await unwrapNoteKey(
    password,
    JSON.parse(stored) as WrappedNoteKey,
    true,
  );
  const recoveryKey = generateRecoveryKey();
  const wrapped = await wrapNoteKeyWithRecoveryKey(key, recoveryKey);
  return {
    code: formatRecoveryKey(recoveryKey),
    save: () => setSetting(RECOVERY_SETTING, JSON.stringify(wrapped)),
  };
}

/**
 * Sets a new password with the recovery key and opens the session. Notes are
 * not re-encrypted: only the note key's password lock is replaced. Returns
 * false when the recovery key is wrong or none was set up.
 */
export async function recoverPrivateNotes(
  recoveryInput: string,
  newPassword: string,
): Promise<boolean> {
  const recoveryKey = parseRecoveryKey(recoveryInput);
  const stored = await getSetting(RECOVERY_SETTING);
  if (!recoveryKey || !stored) return false;
  let key: CryptoKey;
  try {
    key = await unwrapNoteKeyWithRecoveryKey(
      recoveryKey,
      JSON.parse(stored) as WrappedNoteKey,
      true,
    );
  } catch {
    return false;
  }
  const wrapped = await wrapNoteKey(key, newPassword);
  // As in setup, the key goes first: if NODI stops before the verifier is
  // written, the recovery key still works and can simply be used again.
  await setSetting(KEY_SETTING, JSON.stringify(wrapped));
  await storeVerifier(newPassword);
  setPrivateNoteKey(await unwrapNoteKey(newPassword, wrapped));
  await encryptPendingNotes();
  return true;
}

/**
 * Starts private notes over when both the password and the recovery key are
 * lost: encrypted private notes are deleted for good, and the next password
 * creates a new note key. Returns how many notes were deleted.
 */
export async function startPrivateNotesOver(): Promise<number> {
  const deleted = await deleteEncryptedPrivateNotes();
  await deleteSetting(RECOVERY_SETTING);
  await deleteSetting(KEY_SETTING);
  await deleteSetting(PASSWORD_SETTING);
  clearPrivateNoteKey();
  return deleted;
}
