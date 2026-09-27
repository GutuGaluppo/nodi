import { describe, expect, it } from "vitest";
import {
  formatRecoveryKey,
  generateRecoveryKey,
  parseRecoveryKey,
} from "./recoveryKey";

describe("recovery keys", () => {
  it("are 160 random bits shown as eight groups of four", () => {
    const key = generateRecoveryKey();
    expect(key).toHaveLength(20);
    expect(formatRecoveryKey(key)).toMatch(
      /^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){7}$/,
    );
    expect(formatRecoveryKey(generateRecoveryKey())).not.toBe(
      formatRecoveryKey(key),
    );
  });

  it("read back exactly what was shown", () => {
    for (let i = 0; i < 50; i += 1) {
      const key = generateRecoveryKey();
      expect(parseRecoveryKey(formatRecoveryKey(key))).toEqual(key);
    }
    expect(formatRecoveryKey(new Uint8Array(20))).toBe(
      "0000-0000-0000-0000-0000-0000-0000-0000",
    );
    expect(formatRecoveryKey(new Uint8Array(20).fill(255))).toBe(
      "ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ",
    );
  });

  it("forgive case, spacing and look-alike letters when typed by hand", () => {
    const key = generateRecoveryKey();
    const shown = formatRecoveryKey(key);
    const typed = ` ${shown.toLowerCase().replace(/-/g, " ").replace(/0/g, "o").replace(/1/g, "l")} `;
    expect(parseRecoveryKey(typed)).toEqual(key);
  });

  it("reject input that cannot be a recovery key", () => {
    expect(parseRecoveryKey("")).toBeNull();
    expect(parseRecoveryKey("7KQ2-M9XD")).toBeNull();
    expect(parseRecoveryKey("U".repeat(32))).toBeNull();
    expect(parseRecoveryKey("A".repeat(33))).toBeNull();
  });
});
