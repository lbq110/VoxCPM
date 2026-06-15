import { describe, expect, it } from "vitest";
import { extractBookMeta } from "./book-meta";

describe("extractBookMeta — title & author", () => {
  it("reads a markdown h1 title and a labelled author", () => {
    const raw = "# 纪元\n\n作者：王朔\n\n正文第一段开始了。";
    const meta = extractBookMeta(raw);
    expect(meta.title).toBe("纪元");
    expect(meta.author).toBe("王朔");
  });

  it("reads a bare title line + labelled author", () => {
    const raw = "纪元\n作者：王朔\n正文第一段。";
    const meta = extractBookMeta(raw);
    expect(meta).toMatchObject({ title: "纪元", author: "王朔" });
  });

  it("reads a 《》 bracket title and a 'xxx 著' author", () => {
    const raw = "《起初·纪年》\n王朔 著\n\n正文。";
    const meta = extractBookMeta(raw);
    expect(meta).toMatchObject({ title: "起初·纪年", author: "王朔" });
  });

  it("reads a 书名/作者 labelled header", () => {
    const raw = "书名：纪元\n作者：王朔\n正文。";
    const meta = extractBookMeta(raw);
    expect(meta).toMatchObject({ title: "纪元", author: "王朔" });
  });

  it("reads YAML frontmatter", () => {
    const raw = "---\ntitle: 纪元\nauthor: 王朔\n---\n正文。";
    const meta = extractBookMeta(raw);
    expect(meta).toMatchObject({ title: "纪元", author: "王朔" });
  });

  it("reads a title line followed by a bare author name", () => {
    const raw = "活着\n余华\n\n第一章\n我比现在年轻十岁的时候。";
    const meta = extractBookMeta(raw);
    expect(meta).toMatchObject({ title: "活着", author: "余华" });
  });

  it("reads a title above a chapter heading, no author", () => {
    const raw = "纪元\n\n第一章\n正文。";
    const meta = extractBookMeta(raw);
    expect(meta.title).toBe("纪元");
    expect(meta.author).toBe("");
  });

  it("accepts ASCII colons", () => {
    const raw = "纪元\nAuthor: Wang Shuo\n正文。";
    const meta = extractBookMeta(raw);
    expect(meta.author).toBe("Wang Shuo");
  });
});

describe("extractBookMeta — does not invent metadata", () => {
  it("returns empty for a pure body paste", () => {
    const raw = "其实我对已知历史也没有特别强烈个人看法，基本相信这个世界来历的真实性。";
    expect(extractBookMeta(raw)).toMatchObject({ title: "", author: "" });
  });

  it("does not treat a chapter heading as the book title", () => {
    const raw = "第一章\n\n正文从这里开始。";
    expect(extractBookMeta(raw).title).toBe("");
  });

  it("does not steal a real short first paragraph as the title", () => {
    const raw = "他低头\n继续往前走着，没有回头看一眼那扇门。";
    expect(extractBookMeta(raw).title).toBe("");
  });

  it("returns empty for empty input", () => {
    expect(extractBookMeta("")).toEqual({ title: "", author: "", body: "" });
  });
});

describe("extractBookMeta — body cleanup", () => {
  it("strips consumed metadata lines from the body", () => {
    const raw = "纪元\n作者：王朔\n\n正文第一段。\n正文第二段。";
    const body = extractBookMeta(raw).body;
    expect(body).not.toContain("作者：王朔");
    expect(body).not.toMatch(/^纪元/);
    expect(body).toContain("正文第一段");
  });

  it("keeps a markdown h1 heading in the body (used as chapter title)", () => {
    const raw = "# 纪元\n\n作者：王朔\n\n正文。";
    const body = extractBookMeta(raw).body;
    expect(body).toContain("# 纪元");
    expect(body).not.toContain("作者：王朔");
  });

  it("leaves a pure body paste untouched", () => {
    const raw = "正文一。\n正文二。";
    expect(extractBookMeta(raw).body.trim()).toBe(raw.trim());
  });
});
