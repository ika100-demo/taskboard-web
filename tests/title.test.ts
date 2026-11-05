import { describe, expect, it } from "vitest";

import { TITLE_REQUIRED, TITLE_TOO_LONG, titleError } from "@/app/_lib/title";

describe("titleError", () => {
  it("AC-001.5 reports empty and whitespace-only titles", () => {
    expect(TITLE_REQUIRED).toBe("Enter a title.");
    expect(titleError("")).toBe(TITLE_REQUIRED);
    expect(titleError("   \t ")).toBe(TITLE_REQUIRED);
  });

  it("AC-001.6 counts Unicode code points: 200 pass, 201 fail", () => {
    expect(TITLE_TOO_LONG).toBe("The title can have at most 200 characters.");
    expect(titleError("a".repeat(200))).toBeNull();
    expect(titleError("a".repeat(201))).toBe(TITLE_TOO_LONG);
    expect(titleError("😀".repeat(200))).toBeNull();
    expect(titleError("😀".repeat(201))).toBe(TITLE_TOO_LONG);
  });

  it("AC-001.12 accepts a title with surrounding spaces", () => {
    expect(titleError("  Buy milk  ")).toBeNull();
  });
});
