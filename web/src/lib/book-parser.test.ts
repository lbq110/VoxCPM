import { describe, expect, it } from "vitest";
import {
  cleanMarkdownInline,
  continuesSourceParagraph,
  endsSourceParagraph,
  firstSelectableId,
  hasSourceParagraphIndent,
  isLeadingPunctuation,
  isStrongBreakMark,
  isWeakBreakMark,
  lastMeaningfulMark,
  naturalBreakIndex,
  normalizeParsedBlocks,
  parseBookText,
  shouldStartSourceParagraph,
  splitLongParagraph,
  splitOversizedText,
  type BookBlock,
} from "./book-parser";

// ---------------------------------------------------------------------------
// Punctuation classification
// ---------------------------------------------------------------------------

describe("isStrongBreakMark", () => {
  it("recognizes Chinese sentence-end marks", () => {
    expect(isStrongBreakMark("。")).toBe(true);
    expect(isStrongBreakMark("！")).toBe(true);
    expect(isStrongBreakMark("？")).toBe(true);
    expect(isStrongBreakMark("；")).toBe(true);
  });

  it("recognizes ASCII equivalents", () => {
    expect(isStrongBreakMark("!")).toBe(true);
    expect(isStrongBreakMark("?")).toBe(true);
    expect(isStrongBreakMark(";")).toBe(true);
  });

  it("rejects weak or non-break marks", () => {
    expect(isStrongBreakMark("，")).toBe(false);
    expect(isStrongBreakMark("、")).toBe(false);
    expect(isStrongBreakMark("a")).toBe(false);
  });
});

describe("isWeakBreakMark", () => {
  it("recognizes comma and colon variants", () => {
    expect(isWeakBreakMark("，")).toBe(true);
    expect(isWeakBreakMark(",")).toBe(true);
    expect(isWeakBreakMark("、")).toBe(true);
    expect(isWeakBreakMark("：")).toBe(true);
    expect(isWeakBreakMark(":")).toBe(true);
  });

  it("rejects strong break marks", () => {
    expect(isWeakBreakMark("。")).toBe(false);
    expect(isWeakBreakMark("！")).toBe(false);
  });
});

describe("isLeadingPunctuation", () => {
  it("includes closing brackets and quotes", () => {
    expect(isLeadingPunctuation("）")).toBe(true);
    expect(isLeadingPunctuation(")")).toBe(true);
    expect(isLeadingPunctuation("】")).toBe(true);
    expect(isLeadingPunctuation("》")).toBe(true);
  });

  it("includes strong and weak marks", () => {
    expect(isLeadingPunctuation("。")).toBe(true);
    expect(isLeadingPunctuation("，")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// lastMeaningfulMark
// ---------------------------------------------------------------------------

describe("lastMeaningfulMark", () => {
  it("strips trailing closing punctuation to find the real mark", () => {
    expect(lastMeaningfulMark(`说完了”`)).toBe("了");
    expect(lastMeaningfulMark(`什么？”`)).toBe("？");
    expect(lastMeaningfulMark(`结束。）`)).toBe("。");
  });

  it("returns the last character when no closing punctuation", () => {
    expect(lastMeaningfulMark("这是一段话")).toBe("话");
    expect(lastMeaningfulMark("结束。")).toBe("。");
  });

  it("handles empty input", () => {
    expect(lastMeaningfulMark("")).toBe("");
    expect(lastMeaningfulMark("   ")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// cleanMarkdownInline
// ---------------------------------------------------------------------------

describe("cleanMarkdownInline", () => {
  it("strips bold and italic markers", () => {
    expect(cleanMarkdownInline("这是**重点**和*斜体*")).toBe("这是重点和斜体");
  });

  it("strips links keeping text", () => {
    expect(cleanMarkdownInline("[链接](http://example.com)")).toBe("链接");
  });

  it("strips images keeping alt text", () => {
    expect(cleanMarkdownInline("![图片](img.png)")).toBe("图片");
  });

  it("strips inline code backticks", () => {
    expect(cleanMarkdownInline("使用 `console.log` 调试")).toBe("使用 console.log 调试");
  });

  it("strips HTML tags", () => {
    expect(cleanMarkdownInline("text <br/> more")).toBe("text more");
  });

  it("collapses whitespace", () => {
    expect(cleanMarkdownInline("  多   个  空格  ")).toBe("多 个 空格");
  });
});

// ---------------------------------------------------------------------------
// Paragraph boundary detection
// ---------------------------------------------------------------------------

describe("hasSourceParagraphIndent", () => {
  it("detects ideographic space indent", () => {
    expect(hasSourceParagraphIndent("　这是缩进段落")).toBe(true);
    expect(hasSourceParagraphIndent("  　这也是")).toBe(true);
  });

  it("detects four-space indent", () => {
    expect(hasSourceParagraphIndent("    这是四空格缩进")).toBe(true);
  });

  it("detects tab indent", () => {
    expect(hasSourceParagraphIndent("\t缩进内容")).toBe(true);
  });

  it("rejects normal lines", () => {
    expect(hasSourceParagraphIndent("普通文本")).toBe(false);
    expect(hasSourceParagraphIndent("  两个空格")).toBe(false);
  });
});

describe("endsSourceParagraph", () => {
  it("returns true when line ends with strong mark", () => {
    expect(endsSourceParagraph("这句话结束了。")).toBe(true);
    expect(endsSourceParagraph("真的吗？")).toBe(true);
    expect(endsSourceParagraph("太好了！")).toBe(true);
  });

  it("returns true when strong mark is before closing quote", () => {
    expect(endsSourceParagraph("他说：\u201C真的。\u201D")).toBe(true);
  });

  it("returns false for weak marks", () => {
    expect(endsSourceParagraph("虽然这样，")).toBe(false);
    expect(endsSourceParagraph("比如说：")).toBe(false);
  });

  it("returns false when no punctuation", () => {
    expect(endsSourceParagraph("没有标点")).toBe(false);
  });
});

describe("continuesSourceParagraph", () => {
  it("returns true when line ends with weak mark", () => {
    expect(continuesSourceParagraph("虽然这样，")).toBe(true);
  });

  it("returns true when line has no punctuation", () => {
    expect(continuesSourceParagraph("没有标点")).toBe(true);
  });

  it("returns false for undefined", () => {
    expect(continuesSourceParagraph(undefined)).toBe(false);
  });

  it("returns false when line ends with strong mark", () => {
    expect(continuesSourceParagraph("结束了。")).toBe(false);
  });
});

describe("shouldStartSourceParagraph", () => {
  it("starts new paragraph after strong mark + non-leading-punct start", () => {
    expect(shouldStartSourceParagraph("前句结束。", "新段落开始")).toBe(true);
  });

  it("does not start when previous line continues", () => {
    expect(shouldStartSourceParagraph("虽然这样，", "但是还要继续")).toBe(false);
  });

  it("does not start when current line starts with leading punctuation", () => {
    expect(shouldStartSourceParagraph("前句结束。", "，接上一句")).toBe(false);
  });

  it("returns false for undefined inputs", () => {
    expect(shouldStartSourceParagraph(undefined, "text")).toBe(false);
    expect(shouldStartSourceParagraph("text", "")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// naturalBreakIndex
// ---------------------------------------------------------------------------

describe("naturalBreakIndex", () => {
  it("prefers strong break near the limit", () => {
    const text = "第一句话结束了。第二句话也很长，需要在合适的地方断开";
    const index = naturalBreakIndex(text, 12);
    expect(text[index - 1]).toBe("。");
  });

  it("falls back to weak break when no strong break available", () => {
    const text = "这段话没有句号，但是有逗号，所以要在逗号处断开";
    const index = naturalBreakIndex(text, 15);
    expect(isWeakBreakMark(text[index - 1])).toBe(true);
  });

  it("returns maxLength when no break marks found", () => {
    const text = "abcdefghijklmnopqrstuvwxyz";
    expect(naturalBreakIndex(text, 10)).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// splitOversizedText
// ---------------------------------------------------------------------------

describe("splitOversizedText", () => {
  it("splits at natural break points", () => {
    const text = "第一句话已经说完了。第二句话也说得很清楚了。第三句话也不短。第四句话总结一下整体的情况。";
    const chunks = splitOversizedText(text, 20);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(32);
    }
  });

  it("returns single chunk if text is short enough", () => {
    expect(splitOversizedText("短文本", 10)).toEqual(["短文本"]);
  });
});

// ---------------------------------------------------------------------------
// splitLongParagraph
// ---------------------------------------------------------------------------

describe("splitLongParagraph", () => {
  it("returns single item for short text", () => {
    expect(splitLongParagraph("短句。")).toEqual(["短句。"]);
  });

  it("splits long Chinese paragraph at sentence boundaries", () => {
    const long = "这是一段很长的中文文本。它包含了多个句子。每个句子都以句号结尾。我们希望在句号处断开。这样阅读体验会更好。";
    const chunks = splitLongParagraph(long, 30);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(35);
    }
  });

  it("does not split at leading punctuation", () => {
    const chunks = splitLongParagraph("很长的一段话，需要在合适的地方断开。但是不要把逗号留在行首，这样不好看。所以逗号应该跟着上一行。", 30);
    for (const chunk of chunks) {
      if (chunk.length > 1) {
        expect(isLeadingPunctuation(chunk[0])).toBe(false);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// normalizeParsedBlocks
// ---------------------------------------------------------------------------

describe("normalizeParsedBlocks", () => {
  it("moves leading punctuation to the previous text block", () => {
    const blocks: BookBlock[] = [
      { id: "1", text: "前面的文本", kind: "paragraph" },
      { id: "2", text: "，后面的内容", kind: "paragraph" },
    ];
    const result = normalizeParsedBlocks(blocks);
    expect(result[0].text).toBe("前面的文本，");
    expect(result[1].text).toBe("后面的内容");
  });

  it("preserves blocks without leading punctuation", () => {
    const blocks: BookBlock[] = [
      { id: "1", text: "正常段落", kind: "paragraph" },
      { id: "2", text: "另一个段落", kind: "paragraph" },
    ];
    const result = normalizeParsedBlocks(blocks);
    expect(result).toHaveLength(2);
    expect(result[0].text).toBe("正常段落");
    expect(result[1].text).toBe("另一个段落");
  });

  it("skips heading blocks when looking for previous text", () => {
    const blocks: BookBlock[] = [
      { id: "1", text: "段落内容。", kind: "paragraph" },
      { id: "2", text: "标题", kind: "heading", level: 1 },
      { id: "3", text: "，后续文字", kind: "paragraph" },
    ];
    const result = normalizeParsedBlocks(blocks);
    expect(result[0].text).toBe("段落内容。，");
    expect(result[2].text).toBe("后续文字");
  });
});

// ---------------------------------------------------------------------------
// parseBookText — core tests
// ---------------------------------------------------------------------------

describe("parseBookText", () => {
  it("returns empty array for empty input", () => {
    expect(parseBookText("")).toEqual([]);
    expect(parseBookText("   ")).toEqual([]);
  });

  it("strips Markdown frontmatter", () => {
    const input = "---\ntitle: Test\n---\n这是正文内容。";
    const blocks = parseBookText(input);
    expect(blocks.some((b) => b.text.includes("title"))).toBe(false);
    expect(blocks.some((b) => b.text.includes("正文内容"))).toBe(true);
  });

  it("parses headings with correct levels", () => {
    const input = "# 一级标题\n\n## 二级标题\n\n### 三级标题";
    const blocks = parseBookText(input);
    const headings = blocks.filter((b) => b.kind === "heading");
    expect(headings).toHaveLength(3);
    expect(headings[0]).toMatchObject({ text: "一级标题", level: 1 });
    expect(headings[1]).toMatchObject({ text: "二级标题", level: 2 });
    expect(headings[2]).toMatchObject({ text: "三级标题", level: 3 });
  });

  it("parses blockquotes", () => {
    const input = "> 这是引用内容";
    const blocks = parseBookText(input);
    expect(blocks[0]).toMatchObject({ kind: "quote", text: "这是引用内容" });
  });

  it("parses list items", () => {
    const input = "- 项目一\n- 项目二\n1. 有序项目";
    const blocks = parseBookText(input);
    const listItems = blocks.filter((b) => b.kind === "list");
    expect(listItems).toHaveLength(3);
    expect(listItems[0].text).toBe("项目一");
    expect(listItems[2].text).toBe("有序项目");
  });

  it("parses horizontal rules", () => {
    const input = "上面的段落\n\n---\n\n下面的段落";
    const blocks = parseBookText(input);
    expect(blocks.some((b) => b.kind === "rule")).toBe(true);
  });

  it("skips code fences", () => {
    const input = "正文\n\n```\ncode block\n```\n\n继续";
    const blocks = parseBookText(input);
    expect(blocks.some((b) => b.text?.includes("code block"))).toBe(false);
  });

  it("uses custom id prefix", () => {
    const blocks = parseBookText("测试文本", "custom");
    expect(blocks[0].id).toMatch(/^custom-/);
  });

  it("marks continuation only for mid-sentence splits", () => {
    const longParagraph = "这是一段非常非常非常长的中文段落。它的长度远远超过了默认的六十八个字符限制。所以它应该被拆分成多个 BookBlock。第二个及之后的 block 应该标记为 continued。";
    const blocks = parseBookText(longParagraph);
    const paragraphs = blocks.filter((b) => b.kind === "paragraph");
    expect(paragraphs.length).toBeGreaterThan(1);
    expect(paragraphs[0].continued).toBeFalsy();
    // chunks split after strong marks (。) are NOT continued — they start new visual paragraphs
    const afterStrongMark = paragraphs.filter((_, i) => {
      if (i === 0) return false;
      const prev = paragraphs[i - 1].text;
      const lastChar = prev[prev.length - 1];
      return "。！？!?；;".includes(lastChar);
    });
    for (const block of afterStrongMark) {
      expect(block.continued).toBeFalsy();
    }
  });
});

// ---------------------------------------------------------------------------
// parseBookText — WeRead-style fixtures
// ---------------------------------------------------------------------------

describe("parseBookText — WeRead copy-paste format", () => {
  it("joins display line breaks into paragraphs", () => {
    const wereadText = [
      "这是从微信读书复制的文",
      "本，它的换行是根据手机",
      "屏幕宽度来的，并不是真",
      "正的段落分隔。",
      "",
      "这是真正的第二个段落。",
    ].join("\n");

    const blocks = parseBookText(wereadText);
    const paragraphs = blocks.filter((b) => b.kind === "paragraph");
    const allText = paragraphs.map((p) => p.text).join("");
    expect(allText).toContain("这是从微信读书复制的文本");
    expect(allText).toContain("这是真正的第二个段落");
  });

  it("preserves paragraph breaks at blank lines after strong marks", () => {
    const text = [
      "第一段内容。",
      "",
      "第二段内容。",
    ].join("\n");

    const blocks = parseBookText(text);
    const paragraphs = blocks.filter((b) => b.kind === "paragraph" && !b.continued);
    expect(paragraphs.length).toBeGreaterThanOrEqual(2);
  });

  it("does not break mid-sentence at weak marks", () => {
    const text = [
      "虽然这样，",
      "但是还要继续。",
    ].join("\n");

    const blocks = parseBookText(text);
    const allText = blocks.map((b) => b.text).join("");
    expect(allText).toContain("虽然这样，但是还要继续。");
  });

  it("handles indented paragraph starts (full-width space)", () => {
    const text = [
      "　第一段有全角空格缩进。",
      "　第二段也有缩进。",
    ].join("\n");

    const blocks = parseBookText(text);
    const nonContinued = blocks.filter((b) => b.kind === "paragraph" && !b.continued);
    expect(nonContinued.length).toBeGreaterThanOrEqual(2);
  });

  it("handles mixed content with headings and paragraphs", () => {
    const text = [
      "# 第一章",
      "",
      "　这是第一段内容，描述了故事的开头。",
      "",
      "　这是第二段内容。它紧接着第一段。",
      "",
      "## 第一节",
      "",
      "　又一段内容。",
    ].join("\n");

    const blocks = parseBookText(text);
    const headings = blocks.filter((b) => b.kind === "heading");
    const paragraphs = blocks.filter((b) => b.kind === "paragraph");
    expect(headings).toHaveLength(2);
    expect(paragraphs.length).toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// parseBookText — edge cases
// ---------------------------------------------------------------------------

describe("parseBookText — edge cases", () => {
  it("handles Windows-style line endings", () => {
    const text = "第一行。\r\n\r\n第二行。";
    const blocks = parseBookText(text);
    const paragraphs = blocks.filter((b) => b.kind === "paragraph");
    expect(paragraphs.length).toBeGreaterThanOrEqual(2);
  });

  it("handles single line of text", () => {
    const blocks = parseBookText("只有一句话。");
    expect(blocks).toHaveLength(1);
    expect(blocks[0].text).toBe("只有一句话。");
  });

  it("handles text that is only punctuation", () => {
    const blocks = parseBookText("……");
    expect(blocks.length).toBeGreaterThanOrEqual(1);
  });

  it("continuous text without line breaks should still produce non-continued blocks at sentence boundaries", () => {
    const text = "觉得怎么都不像真名，严重影响了本来就日渐低下的虚构事实能力和本人一向秉持的对假定真实感的追求，几只小说因起不出理想人名迟迟不能开篇初心涣散终至放弃。于是想到取巧，找一个人名现成的故事，避开这个困扰。当然其中还有另一层偷懒，人名现成，故事谅必也现成。";
    const blocks = parseBookText(text);
    const paragraphs = blocks.filter((b) => b.kind === "paragraph");
    const nonContinued = paragraphs.filter((b) => !b.continued);
    expect(nonContinued.length).toBeGreaterThan(1);
  });

  it("recognizes bare chapter numbers as headings", () => {
    const text = "上一章最后一句话。\n1\n起初，我六年，匈奴左骨都侯呼衍朵尼驮着紫貂皮来访。";
    const blocks = parseBookText(text);
    const heading = blocks.find((b) => b.kind === "heading");
    expect(heading).toBeDefined();
    expect(heading!.text).toBe("1");
    expect(heading!.level).toBe(2);
  });

  it("recognizes 第X章 style chapter lines as headings", () => {
    const text = "前文结束。\n第十二章\n新章节的正文从这里开始。";
    const blocks = parseBookText(text);
    const heading = blocks.find((b) => b.kind === "heading");
    expect(heading).toBeDefined();
    expect(heading!.text).toBe("第十二章");
  });

  it("does not treat numbers continuing a sentence as chapter headings", () => {
    // a display line break right after a comma — the number belongs to the text
    const text = "总共需要的数量是，\n1992\n年的统计结果。";
    const blocks = parseBookText(text);
    expect(blocks.some((b) => b.kind === "heading")).toBe(false);
  });

  it("does not treat 4+ digit numbers as chapter headings", () => {
    const text = "上一段结束。\n1992\n下一段开始了。";
    const blocks = parseBookText(text);
    expect(blocks.some((b) => b.kind === "heading" && b.text === "1992")).toBe(false);
  });

  it("never lets a block start with a closing bracket (避头尾)", () => {
    const closingStart = /^[）)\]】》」』’”]/;

    // blank-line break right before the closing bracket (WeRead paste shape)
    const text1 = "为单于等下尊为“屠耆”。（马迁注：匈奴语贤者。\n\n）军臣曰：屠耆，俺今日要将那大队兵马入云中可也否则个？";
    for (const b of parseBookText(text1)) {
      expect(b.text).not.toMatch(closingStart);
    }

    // display line break before the closing bracket
    const text2 = "为单于等下尊为“屠耆”。（马迁注：匈奴语贤者。\n）军臣曰：屠耆，俺今日要将那大队兵马入云中可也否则个？";
    for (const b of parseBookText(text2)) {
      expect(b.text).not.toMatch(closingStart);
    }

    // long continuous text where the split lands right at the bracket
    const filler = "中行曰可也者般军臣曰者般也否则个中行曰者般也否俺们知秦知大队兵马候个正著也般赤马虎";
    const text3 = `${filler}，${filler}。（马迁注：匈奴语贤者。）军臣曰：屠耆，${filler}，${filler}。`;
    for (const b of parseBookText(text3)) {
      expect(b.text).not.toMatch(closingStart);
    }
  });

  it("assigns sequential ids", () => {
    const text = "# 标题\n\n段落一。\n\n段落二。";
    const blocks = parseBookText(text);
    const ids = blocks.map((b) => b.id);
    const numbers = ids.map((id) => Number.parseInt(id.split("-").pop()!, 10));
    for (let i = 1; i < numbers.length; i++) {
      expect(numbers[i]).toBeGreaterThan(numbers[i - 1]);
    }
  });
});

// ---------------------------------------------------------------------------
// firstSelectableId
// ---------------------------------------------------------------------------

describe("firstSelectableId", () => {
  it("prefers paragraph over heading", () => {
    const blocks: BookBlock[] = [
      { id: "h1", text: "标题", kind: "heading", level: 1 },
      { id: "p1", text: "段落", kind: "paragraph" },
    ];
    expect(firstSelectableId(blocks)).toBe("p1");
  });

  it("selects quote blocks", () => {
    const blocks: BookBlock[] = [
      { id: "r1", text: "", kind: "rule" },
      { id: "q1", text: "引用", kind: "quote" },
    ];
    expect(firstSelectableId(blocks)).toBe("q1");
  });

  it("falls back to heading when no paragraph/quote/list", () => {
    const blocks: BookBlock[] = [
      { id: "h1", text: "标题", kind: "heading", level: 1 },
      { id: "r1", text: "", kind: "rule" },
    ];
    expect(firstSelectableId(blocks)).toBe("h1");
  });

  it("returns fallback id for empty array", () => {
    expect(firstSelectableId([])).toBe("placeholder");
    expect(firstSelectableId([], "custom")).toBe("custom");
  });
});
