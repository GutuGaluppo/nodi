import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  settings: new Map<string, string>(),
  encryptPendingPrivateNotes: vi.fn(),
}));

vi.mock("../../db/repositories/settingsRepository", () => ({
  getSetting: vi.fn(async (key: string) => mocks.settings.get(key) ?? null),
  setSetting: vi.fn(async (key: string, value: string) => {
    mocks.settings.set(key, value);
  }),
}));

vi.mock("../../db/repositories/noteRepository", () => ({
  encryptPendingPrivateNotes: mocks.encryptPendingPrivateNotes,
}));

async function load() {
  const password = await import("./privateNotePassword");
  const session = await import("../../db/privateNoteKey");
  const cipher = await import("../../lib/crypto/noteCipher");
  return { ...password, ...session, ...cipher };
}

const payload = { title: "Journal", contentJson: "{}", contentText: "secret" };

describe("private notes password", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.settings.clear();
    mocks.encryptPendingPrivateNotes.mockReset().mockResolvedValue(0);
  });

  it("stores a verifier and a wrapped key, never the password, and opens the session", async () => {
    const { setPrivateNotesPassword, getPrivateNoteKey } = await load();

    await setPrivateNotesPassword("correct horse");

    const stored = [...mocks.settings.values()].join(" ");
    expect(mocks.settings.has("private_notes_password")).toBe(true);
    expect(mocks.settings.has("private_notes_key")).toBe(true);
    expect(stored).not.toContain("correct horse");
    expect(getPrivateNoteKey()).not.toBeNull();
    expect(mocks.encryptPendingPrivateNotes).toHaveBeenCalledOnce();
  });

  it("rejects a wrong password without opening the session", async () => {
    const { setPrivateNotesPassword, unlockPrivateNotes, clearPrivateNoteKey } =
      await load();
    await setPrivateNotesPassword("correct horse");
    clearPrivateNoteKey();
    const { getPrivateNoteKey } = await load();

    await expect(unlockPrivateNotes("wrong password")).resolves.toBe(false);
    expect(getPrivateNoteKey()).toBeNull();
  });

  it("unlocks the same key that encrypted the notes", async () => {
    const {
      setPrivateNotesPassword,
      unlockPrivateNotes,
      getPrivateNoteKey,
      clearPrivateNoteKey,
      encryptNotePayload,
      decryptNotePayload,
    } = await load();
    await setPrivateNotesPassword("correct horse");
    const setupKey = getPrivateNoteKey();
    if (!setupKey) throw new Error("setup did not open the session");
    const sealed = await encryptNotePayload(setupKey, "note-1", payload);
    clearPrivateNoteKey();

    await expect(unlockPrivateNotes("correct horse")).resolves.toBe(true);

    const unlocked = getPrivateNoteKey();
    if (!unlocked) throw new Error("unlock did not open the session");
    await expect(
      decryptNotePayload(unlocked, "note-1", sealed),
    ).resolves.toEqual(payload);
  });

  it("creates a key on the first unlock after upgrading and encrypts pending notes", async () => {
    const { setPrivateNotesPassword, unlockPrivateNotes, getPrivateNoteKey } =
      await load();
    await setPrivateNotesPassword("correct horse");
    // A password set before encryption existed has a verifier but no key.
    mocks.settings.delete("private_notes_key");
    mocks.encryptPendingPrivateNotes.mockClear();

    await expect(unlockPrivateNotes("correct horse")).resolves.toBe(true);

    expect(mocks.settings.has("private_notes_key")).toBe(true);
    expect(getPrivateNoteKey()).not.toBeNull();
    expect(mocks.encryptPendingPrivateNotes).toHaveBeenCalledOnce();
  });

  it("still unlocks when pending notes cannot be encrypted yet", async () => {
    const { setPrivateNotesPassword, unlockPrivateNotes } = await load();
    await setPrivateNotesPassword("correct horse");
    mocks.encryptPendingPrivateNotes.mockRejectedValueOnce(new Error("busy"));
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    await expect(unlockPrivateNotes("correct horse")).resolves.toBe(true);

    consoleError.mockRestore();
  });
});
