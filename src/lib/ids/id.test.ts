import { afterEach, describe, expect, it, vi } from "vitest";
import { createId } from "./id";

const UUID_V7 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("createId", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("produces canonical UUID version 7 strings", () => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      expect(createId()).toMatch(UUID_V7);
    }
  });

  it("does not collide across many generations", () => {
    const ids = new Set<string>();
    for (let attempt = 0; attempt < 10_000; attempt += 1) {
      ids.add(createId());
    }
    expect(ids.size).toBe(10_000);
  });

  it("sorts lexicographically by creation time", () => {
    vi.useFakeTimers();

    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const earlier = createId();

    vi.setSystemTime(new Date("2026-06-01T00:00:00.000Z"));
    const later = createId();

    expect(earlier < later).toBe(true);
  });
});
