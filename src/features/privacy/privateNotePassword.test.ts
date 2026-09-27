import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  settings: new Map<string, string>(),
  invoke: vi.fn(),
  encryptPendingPrivateNotes: vi.fn(),
  deleteEncryptedPrivateNotes: vi.fn(),
}));

vi.mock("../../db/repositories/settingsRepository", () => ({
  getSetting: vi.fn(async (key: string) => mocks.settings.get(key) ?? null),
  setSetting: vi.fn(async (key: string, value: string) => {
    mocks.settings.set(key, value);
  }),
  deleteSetting: vi.fn(async (key: string) => {
    mocks.settings.delete(key);
  }),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));

// Stands in for the Secure Enclave: sealing is reversible, opening can be
// cancelled like the Touch ID prompt.
let touchIdAnswer: "opened" | "cancelled" = "opened";
function fakeTouchId(command: string, args: Record<string, string>) {
  if (command === "touch_id_seal") return `sealed:${args.secret}`;
  if (command === "touch_id_unseal") {
    return touchIdAnswer === "cancelled"
      ? { status: "cancelled" }
      : { status: "opened", value: args.sealed.slice("sealed:".length) };
  }
  if (command === "touch_id_support")
    return { available: true, biometrics: true };
  throw new Error(`unexpected command ${command}`);
}

vi.mock("../../db/repositories/noteRepository", () => ({
  encryptPendingPrivateNotes: mocks.encryptPendingPrivateNotes,
  deleteEncryptedPrivateNotes: mocks.deleteEncryptedPrivateNotes,
}));

async function load() {
  const password = await import("./privateNotePassword");
  const session = await import("../../db/privateNoteKey");
  const cipher = await import("../../lib/crypto/noteCipher");
  const recovery = await import("../../lib/crypto/recoveryKey");
  return { ...password, ...session, ...cipher, ...recovery };
}

const payload = { title: "Journal", contentJson: "{}", contentText: "secret" };

describe("private notes password", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.settings.clear();
    mocks.encryptPendingPrivateNotes.mockReset().mockResolvedValue(0);
    mocks.deleteEncryptedPrivateNotes.mockReset().mockResolvedValue(2);
    mocks.invoke
      .mockReset()
      .mockImplementation(async (command, args) => fakeTouchId(command, args));
    touchIdAnswer = "opened";
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

  describe("recovery", () => {
    async function setUpWithRecoveryKey() {
      const modules = await load();
      await modules.setPrivateNotesPassword("correct horse");
      const key = modules.getPrivateNoteKey();
      if (!key) throw new Error("setup did not open the session");
      const sealed = await modules.encryptNotePayload(key, "note-1", payload);
      const draft = await modules.prepareRecoveryKey("correct horse");
      if (!draft) throw new Error("no recovery key was prepared");
      return { ...modules, sealed, draft };
    }

    it("stores nothing until the recovery key is saved, and never the key itself", async () => {
      const { draft, hasRecoveryKey } = await setUpWithRecoveryKey();

      expect(mocks.settings.has("private_notes_recovery_key")).toBe(false);
      await draft.save();

      expect(await hasRecoveryKey()).toBe(true);
      const stored = [...mocks.settings.values()].join(" ");
      expect(stored).not.toContain(draft.code);
      expect(stored).not.toContain(draft.code.replace(/-/g, ""));
    });

    it("prepares no recovery key for a wrong password", async () => {
      const { prepareRecoveryKey } = await setUpWithRecoveryKey();
      await expect(prepareRecoveryKey("wrong password")).resolves.toBeNull();
    });

    it("sets a new password with the recovery key and keeps the notes readable", async () => {
      const { draft, sealed } = await setUpWithRecoveryKey();
      await draft.save();
      const before = mocks.settings.get("private_notes_recovery_key");
      const {
        recoverPrivateNotes,
        unlockPrivateNotes,
        getPrivateNoteKey,
        clearPrivateNoteKey,
        decryptNotePayload,
      } = await load();
      clearPrivateNoteKey();
      mocks.encryptPendingPrivateNotes.mockClear();

      await expect(
        recoverPrivateNotes(draft.code.toLowerCase(), "battery staple"),
      ).resolves.toBe(true);

      const key = getPrivateNoteKey();
      if (!key) throw new Error("recovery did not open the session");
      await expect(decryptNotePayload(key, "note-1", sealed)).resolves.toEqual(
        payload,
      );
      expect(mocks.encryptPendingPrivateNotes).toHaveBeenCalledOnce();
      // The recovery key keeps working until the user saves a new one.
      expect(mocks.settings.get("private_notes_recovery_key")).toBe(before);

      clearPrivateNoteKey();
      await expect(unlockPrivateNotes("correct horse")).resolves.toBe(false);
      await expect(unlockPrivateNotes("battery staple")).resolves.toBe(true);
    });

    it("rejects a wrong or missing recovery key without changing anything", async () => {
      const {
        draft,
        recoverPrivateNotes,
        formatRecoveryKey,
        generateRecoveryKey,
      } = await setUpWithRecoveryKey();
      const snapshot = new Map(mocks.settings);

      await expect(
        recoverPrivateNotes(
          formatRecoveryKey(generateRecoveryKey()),
          "x".repeat(8),
        ),
      ).resolves.toBe(false);
      await expect(
        recoverPrivateNotes("not a key", "x".repeat(8)),
      ).resolves.toBe(false);
      // Not saved yet: there is nothing to recover with.
      await expect(
        recoverPrivateNotes(draft.code, "x".repeat(8)),
      ).resolves.toBe(false);
      expect(mocks.settings).toEqual(snapshot);
    });

    it("replacing the recovery key retires the old one", async () => {
      const { draft, prepareRecoveryKey, recoverPrivateNotes } =
        await setUpWithRecoveryKey();
      await draft.save();
      const next = await prepareRecoveryKey("correct horse");
      await next?.save();

      await expect(
        recoverPrivateNotes(draft.code, "x".repeat(8)),
      ).resolves.toBe(false);
      await expect(
        recoverPrivateNotes(next?.code ?? "", "x".repeat(8)),
      ).resolves.toBe(true);
    });

    it("starting over deletes encrypted notes and every key, then allows a new password", async () => {
      const {
        draft,
        startPrivateNotesOver,
        getPrivateNoteKey,
        hasPrivateNotesPassword,
      } = await setUpWithRecoveryKey();
      await draft.save();

      await expect(startPrivateNotesOver()).resolves.toBe(2);

      expect(mocks.deleteEncryptedPrivateNotes).toHaveBeenCalledOnce();
      expect([...mocks.settings.keys()]).toEqual([]);
      expect(getPrivateNoteKey()).toBeNull();
      await expect(hasPrivateNotesPassword()).resolves.toBe(false);
    });
  });

  describe("Touch ID", () => {
    async function setUpWithTouchId() {
      const modules = await load();
      await modules.setPrivateNotesPassword("correct horse");
      const key = modules.getPrivateNoteKey();
      if (!key) throw new Error("setup did not open the session");
      const sealed = await modules.encryptNotePayload(key, "note-1", payload);
      await expect(modules.enableTouchId("correct horse")).resolves.toBe(true);
      modules.clearPrivateNoteKey();
      return { ...modules, sealed };
    }

    it("is turned on only with the right password", async () => {
      const { setPrivateNotesPassword, enableTouchId, isTouchIdEnabled } =
        await load();
      await setPrivateNotesPassword("correct horse");

      await expect(enableTouchId("wrong password")).resolves.toBe(false);
      await expect(isTouchIdEnabled()).resolves.toBe(false);
      expect(mocks.invoke).not.toHaveBeenCalled();

      await expect(enableTouchId("correct horse")).resolves.toBe(true);
      await expect(isTouchIdEnabled()).resolves.toBe(true);
    });

    it("opens the same key that encrypted the notes", async () => {
      const {
        sealed,
        unlockWithTouchId,
        getPrivateNoteKey,
        decryptNotePayload,
      } = await setUpWithTouchId();

      await expect(unlockWithTouchId()).resolves.toBe(true);

      const key = getPrivateNoteKey();
      if (!key) throw new Error("Touch ID did not open the session");
      expect(key.extractable).toBe(false);
      await expect(decryptNotePayload(key, "note-1", sealed)).resolves.toEqual(
        payload,
      );
    });

    it("leaves notes locked when the prompt is cancelled", async () => {
      const { unlockWithTouchId, resetPasswordWithTouchId, getPrivateNoteKey } =
        await setUpWithTouchId();
      touchIdAnswer = "cancelled";
      const snapshot = new Map(mocks.settings);

      await expect(unlockWithTouchId()).resolves.toBe(false);
      await expect(resetPasswordWithTouchId("battery staple")).resolves.toBe(
        false,
      );
      expect(getPrivateNoteKey()).toBeNull();
      expect(mocks.settings).toEqual(snapshot);
    });

    it("resets a forgotten password", async () => {
      const {
        sealed,
        resetPasswordWithTouchId,
        unlockPrivateNotes,
        clearPrivateNoteKey,
        getPrivateNoteKey,
        decryptNotePayload,
      } = await setUpWithTouchId();

      await expect(resetPasswordWithTouchId("battery staple")).resolves.toBe(
        true,
      );
      clearPrivateNoteKey();
      await expect(unlockPrivateNotes("correct horse")).resolves.toBe(false);
      await expect(unlockPrivateNotes("battery staple")).resolves.toBe(true);
      const key = getPrivateNoteKey();
      if (!key) throw new Error("the new password did not open the session");
      await expect(decryptNotePayload(key, "note-1", sealed)).resolves.toEqual(
        payload,
      );
    });

    it("is forgotten when turned off or when starting over", async () => {
      const {
        disableTouchId,
        enableTouchId,
        isTouchIdEnabled,
        startPrivateNotesOver,
        unlockWithTouchId,
      } = await setUpWithTouchId();

      await disableTouchId();
      await expect(isTouchIdEnabled()).resolves.toBe(false);
      await expect(unlockWithTouchId()).rejects.toThrow();

      await enableTouchId("correct horse");
      await startPrivateNotesOver();
      await expect(isTouchIdEnabled()).resolves.toBe(false);
    });

    it("reports no support when the native side is missing", async () => {
      const { getTouchIdSupport } = await load();
      mocks.invoke.mockRejectedValueOnce(new Error("not in Tauri"));

      await expect(getTouchIdSupport()).resolves.toEqual({
        available: false,
        biometrics: false,
      });
    });
  });
});
