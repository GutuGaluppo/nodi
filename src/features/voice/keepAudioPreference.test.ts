import { describe, expect, it } from "vitest";
import { readKeepAudio, storeKeepAudio } from "./keepAudioPreference";

describe("keep audio preference", () => {
  it("keeps recordings by default", () => {
    expect(readKeepAudio()).toBe(true);
  });

  it("remembers an explicit choice either way", () => {
    storeKeepAudio(false);
    expect(readKeepAudio()).toBe(false);
    storeKeepAudio(true);
    expect(readKeepAudio()).toBe(true);
  });
});
