import { describe, expect, it } from "vitest";
import {
  createNoteKey,
  decryptNotePayload,
  encryptNotePayload,
  unwrapNoteKey,
} from "./noteCipher";

const payload = {
  title: "Journal",
  contentJson: '{"type":"doc","content":[{"type":"paragraph"}]}',
  contentText: "Something only I should read",
};

describe("noteCipher", () => {
  it("round-trips a note payload and never exposes the plaintext", async () => {
    const { key } = await createNoteKey("correct horse");
    const sealed = await encryptNotePayload(key, "note-1", payload);

    expect(sealed).not.toContain("Journal");
    expect(sealed).not.toContain("only I should read");
    await expect(decryptNotePayload(key, "note-1", sealed)).resolves.toEqual(
      payload,
    );
  });

  it("uses a fresh IV for every encryption", async () => {
    const { key } = await createNoteKey("correct horse");
    const first = await encryptNotePayload(key, "note-1", payload);
    const second = await encryptNotePayload(key, "note-1", payload);

    expect(first).not.toBe(second);
  });

  it("unwraps the stored key only with the right password", async () => {
    const { key, wrapped } = await createNoteKey("correct horse");
    const sealed = await encryptNotePayload(key, "note-1", payload);

    const restored = await unwrapNoteKey("correct horse", wrapped);
    await expect(
      decryptNotePayload(restored, "note-1", sealed),
    ).resolves.toEqual(payload);
    await expect(unwrapNoteKey("wrong password", wrapped)).rejects.toThrow();
  });

  it("stores the wrapped key without the password", async () => {
    const { wrapped } = await createNoteKey("correct horse");

    expect(JSON.stringify(wrapped)).not.toContain("correct horse");
  });

  it("rejects a ciphertext moved onto another note", async () => {
    const { key } = await createNoteKey("correct horse");
    const sealed = await encryptNotePayload(key, "note-1", payload);

    await expect(decryptNotePayload(key, "note-2", sealed)).rejects.toThrow();
  });

  it("rejects altered ciphertext", async () => {
    const { key } = await createNoteKey("correct horse");
    const envelope = JSON.parse(
      await encryptNotePayload(key, "note-1", payload),
    );
    const bytes = Uint8Array.from(atob(envelope.ct), (c) => c.charCodeAt(0));
    bytes[0] ^= 0xff;
    envelope.ct = btoa(String.fromCharCode(...bytes));

    await expect(
      decryptNotePayload(key, "note-1", JSON.stringify(envelope)),
    ).rejects.toThrow();
  });

  it("rejects a key from another password setup", async () => {
    const { key } = await createNoteKey("correct horse");
    const { key: otherKey } = await createNoteKey("correct horse");
    const sealed = await encryptNotePayload(key, "note-1", payload);

    await expect(
      decryptNotePayload(otherKey, "note-1", sealed),
    ).rejects.toThrow();
  });
});
