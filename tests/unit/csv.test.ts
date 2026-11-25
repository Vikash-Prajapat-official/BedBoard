import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "@/lib/csv";

describe("csvCell", () => {
  it("passes plain values through", () => {
    expect(csvCell("General Male")).toBe("General Male");
    expect(csvCell(42)).toBe("42");
    expect(csvCell(-3.5)).toBe("-3.5"); // a real negative number is not a formula
    expect(csvCell(true)).toBe("true");
  });
  it("empty for null and undefined", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });
  it("dates become ISO 8601", () => {
    expect(csvCell(new Date("2026-11-25T10:00:00Z"))).toBe("2026-11-25T10:00:00.000Z");
  });
  it("quotes cells with commas, quotes or line breaks, doubling inner quotes", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
  });
  it("neutralises spreadsheet formulas in text (CSV injection)", () => {
    for (const bad of ["=1+1", "+cmd", "-2+3", "@SUM(A1)", "\tx", "\rx"]) {
      const out = csvCell(bad);
      expect(out.replace(/^"/, "").startsWith("'")).toBe(true);
    }
    expect(csvCell("=HYPERLINK(\"http://x\")")).toBe('"\'=HYPERLINK(""http://x"")"');
  });
});

describe("toCsv", () => {
  it("header, rows, CRLF line ends, trailing newline", () => {
    expect(toCsv(["ward", "free"], [["ICU", 2], ["Maternity, East", 0]])).toBe('ward,free\r\nICU,2\r\n"Maternity, East",0\r\n');
  });
  it("header only when there are no rows", () => {
    expect(toCsv(["a", "b"], [])).toBe("a,b\r\n");
  });
});
