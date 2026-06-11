import { describe, expect, it } from "vitest";
import type { BookBlock } from "./book-parser";
import { buildAskContext, buildRecapContext } from "./ask-context";

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

describe("buildRecapContext", () => {
  const MANY: BookBlock[] = Array.from({ length: 60 }, (_, i) => ({
    id: `b${i}`,
    text: `第${i}段：这一段大约有三十个字的剧情内容用来撑起篇幅测试。`,
    kind: "paragraph" as const,
  }));

  it("includes the opening blocks (story setup)", () => {
    const recap = buildRecapContext(MANY, "b50");
    expect(recap.some((t) => t.includes("第0段"))).toBe(true);
  });

  it("includes the most recent blocks before the reading position", () => {
    const recap = buildRecapContext(MANY, "b50");
    expect(recap.some((t) => t.includes("第49段"))).toBe(true);
  });

  it("samples the middle so the whole arc is covered", () => {
    const recap = buildRecapContext(MANY, "b50");
    const hasMiddle = recap.some((t) => {
      const m = t.match(/第(\d+)段/);
      const n = m ? Number(m[1]) : -1;
      return n >= 10 && n <= 40;
    });
    expect(hasMiddle).toBe(true);
  });

  it("NEVER includes blocks at or after the reading position", () => {
    const recap = buildRecapContext(MANY, "b50");
    for (const t of recap) {
      const m = t.match(/第(\d+)段/);
      expect(Number(m![1])).toBeLessThan(50);
    }
  });

  it("keeps texts in reading order without duplicates", () => {
    const recap = buildRecapContext(MANY, "b50");
    const nums = recap.map((t) => Number(t.match(/第(\d+)段/)![1]));
    expect(new Set(nums).size).toBe(nums.length);
    expect([...nums].sort((a, b) => a - b)).toEqual(nums);
  });

  it("respects the character budget", () => {
    const recap = buildRecapContext(MANY, "b50", 300);
    expect(recap.join("").length).toBeLessThanOrEqual(300);
  });

  it("handles a short read history without duplication", () => {
    const recap = buildRecapContext(MANY, "b5");
    const nums = recap.map((t) => Number(t.match(/第(\d+)段/)![1]));
    expect(new Set(nums).size).toBe(nums.length);
    expect(Math.max(...nums)).toBeLessThan(5);
  });

  it("returns empty when nothing has been read", () => {
    expect(buildRecapContext(MANY, "b0")).toEqual([]);
    expect(buildRecapContext(MANY, "nope")).toEqual([]);
  });
});
