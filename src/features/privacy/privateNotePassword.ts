import {
  getSetting,
  setSetting,
} from "../../db/repositories/settingsRepository";

const PASSWORD_SETTING = "private_notes_password";
const ITERATIONS = 210_000;

interface PasswordVerifier {
  salt: string;
  hash: string;
}

function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
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

function base64ToBytes(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

/** Stores a salted verifier only; the password itself never reaches SQLite. */
export async function setPrivateNotesPassword(password: string): Promise<void> {
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
