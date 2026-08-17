import { describe, expect, test } from "bun:test";

import { inlineSegments, visibleText } from "../src/inline";

describe("inline formatting", () => {
  test("parses bold, italic, combined styles and links", () => {
    expect(
      inlineSegments(
        "Use **bold**, *italic*, ***both*** and [**linked**](https://example.com)",
      ),
    ).toEqual([
      { text: "Use " },
      { bold: true, text: "bold" },
      { text: ", " },
      { italic: true, text: "italic" },
      { text: ", " },
      { bold: true, italic: true, text: "both" },
      { text: " and " },
      { bold: true, text: "linked", url: "https://example.com" },
    ]);
  });

  test("keeps unmatched markers visible", () => {
    expect(visibleText("Kernel * wildcard and **unfinished")).toBe(
      "Kernel * wildcard and **unfinished",
    );
  });

  test("visible text removes all supported syntax", () => {
    expect(visibleText("**Bold** [and *linked*](https://example.com)")).toBe(
      "Bold and linked",
    );
  });
});
