import { describe, expect, it } from "vitest";
import { parseReaderState, serializeReaderState, type ReaderState } from "./reader-state";

const FULL: ReaderState = {
  anchorBlockId: "jiyuan-42",
  fontSize: 22,
  lineHeight: 1.95,
  themeId: "paper",
  notes: ["笔记一", "笔记二"],
  highlightedIds: ["jiyuan-3", "jiyuan-7"],
  askMessages: [
    { role: "user", content: "问题" },
    { role: "assistant", content: "回答" },
  ],
};

describe("reader-state round trip", () => {
  it("serializes and parses back identically", () => {
    expect(parseReaderState(serializeReaderState(FULL))).toEqual(FULL);
  });
});

describe("parseReaderState validation", () => {
  it("returns null for corrupted JSON", () => {
    expect(parseReaderState("{not json")).toBeNull();
    expect(parseReaderState("")).toBeNull();
    expect(parseReaderState(null)).toBeNull();
  });

  it("returns null for non-object payloads", () => {
    expect(parseReaderState('"string"')).toBeNull();
    expect(parseReaderState("[1,2]")).toBeNull();
  });

  it("fills safe defaults for missing fields", () => {
    const state = parseReaderState("{}")!;
    expect(state.anchorBlockId).toBeNull();
    expect(state.fontSize).toBe(20);
    expect(state.lineHeight).toBe(2.05);
    expect(state.themeId).toBe("night");
    expect(state.notes).toEqual([]);
    expect(state.highlightedIds).toEqual([]);
    expect(state.askMessages).toEqual([]);
  });

  it("clamps fontSize and lineHeight to the UI ranges", () => {
    const state = parseReaderState(JSON.stringify({ fontSize: 99, lineHeight: 0.1 }))!;
    expect(state.fontSize).toBeLessThanOrEqual(26);
    expect(state.fontSize).toBeGreaterThanOrEqual(16);
    expect(state.lineHeight).toBeGreaterThanOrEqual(1.65);
    expect(state.lineHeight).toBeLessThanOrEqual(2.35);
  });

  it("rejects unknown theme ids", () => {
    const state = parseReaderState(JSON.stringify({ themeId: "rainbow" }))!;
    expect(state.themeId).toBe("night");
  });

  it("drops malformed entries in arrays", () => {
    const state = parseReaderState(
      JSON.stringify({
        notes: ["好的", 42, null],
        highlightedIds: ["a", {}, "b"],
        askMessages: [
          { role: "user", content: "ok" },
          { role: "hacker", content: "bad" },
          { role: "assistant" },
        ],
      }),
    )!;
    expect(state.notes).toEqual(["好的"]);
    expect(state.highlightedIds).toEqual(["a", "b"]);
    expect(state.askMessages).toEqual([{ role: "user", content: "ok" }]);
  });
});
