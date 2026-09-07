import { describe, expect, it } from "vitest";
import { parseSearchInput } from "./searchParser";

describe("parseSearchInput", () => {
  it("extracts every supported filter and preserves free text", () => {
    expect(
      parseSearchInput(
        'roadmap tag:ideas notebook:"Product Studio" created:2026-09-01 updated:2026-09-07',
      ),
    ).toEqual({
      text: "roadmap",
      filters: {
        tag: "ideas",
        notebook: "Product Studio",
        created: "2026-09-01",
        updated: "2026-09-07",
      },
    });
  });

  it("uses the final occurrence and treats unknown prefixes as text", () => {
    expect(parseSearchInput("tag:first tag:second owner:me")).toEqual({
      text: "owner:me",
      filters: { tag: "second" },
    });
  });
});
