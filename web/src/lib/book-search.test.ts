import { describe, expect, it } from "vitest";
import type { BookBlock } from "./book-parser";
import { searchReadBlocks } from "./book-search";

function block(id: string, text: string): BookBlock {
  return { id, text, kind: "paragraph" };
}

const BLOCKS: BookBlock[] = [
  block("b1", "田蚡离席长揖，向阿老求情，说用咱听着不闹心正经汉语。"),
  block("b2", "冬十一月，马厩翻建工程接近完成，试取暖一把火又给烧了。"),
  block("b3", "田蚡来向我报告时不忧反喜，说大家都说烧得好，总提将来要火。"),
  block("b4", "中行老师说单于新立必入中国，这是匈奴习俗汉人也知道。"),
  block("b5", "我说大家——大家都是谁呀？田蚡说就是一号院史曹，没外人。"),
  block("b6", "（当前阅读位置）总提到今儿定下的成员一次头未碰。"),
  block("b7", "后文：田蚡升任太尉，权倾朝野。"),
  block("b8", "后文：单于率军南下，战事爆发。"),
];

describe("searchReadBlocks", () => {
  it("finds blocks relevant to the query from earlier chapters", () => {
    const hits = searchReadBlocks(BLOCKS, "b6", "田蚡是谁", 3);
    const joined = hits.map((h) => h.text).join("");
    expect(joined).toContain("田蚡");
  });

  it("ranks blocks mentioning the query terms above unrelated ones", () => {
    const hits = searchReadBlocks(BLOCKS, "b6", "田蚡", 2);
    for (const h of hits) {
      expect(h.text).toContain("田蚡");
    }
  });

  it("NEVER returns blocks at or after the reading position (no spoilers)", () => {
    const hits = searchReadBlocks(BLOCKS, "b6", "田蚡 单于 战事", 10);
    const joined = hits.map((h) => h.text).join("");
    expect(joined).not.toContain("太尉");
    expect(joined).not.toContain("战事爆发");
    expect(joined).not.toContain("当前阅读位置");
  });

  it("returns at most topK results", () => {
    expect(searchReadBlocks(BLOCKS, "b6", "田蚡", 1)).toHaveLength(1);
  });

  it("returns empty for queries with no overlap", () => {
    const hits = searchReadBlocks(BLOCKS, "b6", "量子力学薛定谔", 5);
    expect(hits).toHaveLength(0);
  });

  it("returns empty when active block is the first block", () => {
    expect(searchReadBlocks(BLOCKS, "b1", "田蚡", 5)).toHaveLength(0);
  });

  it("handles unknown active id gracefully", () => {
    expect(searchReadBlocks(BLOCKS, "nope", "田蚡", 5)).toHaveLength(0);
  });
});

describe("searchReadBlocks — whole-book mode (activeId = null)", () => {
  it("searches the ENTIRE book including later chapters", () => {
    const hits = searchReadBlocks(BLOCKS, null, "战事爆发", 5);
    expect(hits.map((h) => h.text).join("")).toContain("战事爆发");
  });

  it("finds 4+ character phrases (the ngram-limit case)", () => {
    const hits = searchReadBlocks(BLOCKS, null, "马厩翻建工程", 5);
    expect(hits.map((h) => h.text).join("")).toContain("马厩翻建工程");
  });

  it("still ranks relevant blocks first", () => {
    const hits = searchReadBlocks(BLOCKS, null, "田蚡", 3);
    expect(hits.length).toBeGreaterThan(0);
    for (const h of hits) expect(h.text).toContain("田蚡");
  });
});
