import { describe, expect, it } from "vitest";
import type { BookBlock } from "./book-parser";
import { buildAskContext } from "./ask-context";

function block(id: string, text: string, kind: BookBlock["kind"] = "paragraph"): BookBlock {
  return { id, text, kind };
}

const BLOCKS: BookBlock[] = [
  block("b1", "第一段：故事开始。"),
  block("b2", "第二段：主角登场。"),
  block("h1", "第二章", "heading"),
  block("b3", "第三段：冲突出现。"),
  block("r1", "", "rule"),
  block("b4", "第四段：当前阅读位置。"),
  block("b5", "第五段：后文剧情。"),
  block("b6", "第六段：结局揭晓。"),
];

describe("buildAskContext", () => {
  it("includes the active passage text", () => {
    const ctx = buildAskContext(BLOCKS, "b4");
    expect(ctx.passage).toBe("第四段：当前阅读位置。");
  });

  it("only includes blocks BEFORE the active one (no spoilers)", () => {
    const ctx = buildAskContext(BLOCKS, "b4");
    const joined = ctx.before.join("");
    expect(joined).toContain("第三段");
    expect(joined).not.toContain("第五段");
    expect(joined).not.toContain("结局揭晓");
  });

  it("keeps reading order in before context", () => {
    const ctx = buildAskContext(BLOCKS, "b4");
    const i1 = ctx.before.findIndex((t) => t.includes("第一段"));
    const i3 = ctx.before.findIndex((t) => t.includes("第三段"));
    expect(i1).toBeGreaterThanOrEqual(0);
    expect(i3).toBeGreaterThan(i1);
  });

  it("includes headings in the before context (chapter info)", () => {
    const ctx = buildAskContext(BLOCKS, "b4");
    expect(ctx.before.some((t) => t.includes("第二章"))).toBe(true);
  });

  it("skips rule blocks", () => {
    const ctx = buildAskContext(BLOCKS, "b4");
    expect(ctx.before.every((t) => t.trim().length > 0)).toBe(true);
  });

  it("truncates by maxChars keeping the NEAREST preceding text", () => {
    const ctx = buildAskContext(BLOCKS, "b4", 25);
    const joined = ctx.before.join("");
    expect(joined.length).toBeLessThanOrEqual(25);
    // nearest blocks win: 第三段 must survive, 第一段 dropped
    expect(joined).toContain("第三段");
    expect(joined).not.toContain("第一段");
  });

  it("returns empty before when active is the first block", () => {
    const ctx = buildAskContext(BLOCKS, "b1");
    expect(ctx.before).toEqual([]);
    expect(ctx.passage).toContain("第一段");
  });

  it("returns empty context for unknown id", () => {
    const ctx = buildAskContext(BLOCKS, "nope");
    expect(ctx.passage).toBe("");
    expect(ctx.before).toEqual([]);
  });
});
