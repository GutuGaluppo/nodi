/**
 * The unwrapped private-note key for the running session.
 *
 * It exists only in memory, after the user enters the private-notes password,
 * and is never written anywhere. Without it, encrypted notes stay locked.
 */
let sessionKey: CryptoKey | null = null;

export function getPrivateNoteKey(): CryptoKey | null {
  return sessionKey;
}

export function setPrivateNoteKey(key: CryptoKey): void {
  sessionKey = key;
}

export function clearPrivateNoteKey(): void {
  sessionKey = null;
}
