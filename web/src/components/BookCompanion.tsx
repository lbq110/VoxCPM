"use client";

import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";

type DialoguePartner = {
  id: string;
  name: string;
  role: string;
  edge: string;
};

type Panel = "toc" | "listen" | "ask" | "dialogue" | "notes" | "settings";
type CompanionMode = "解释" | "举例" | "质疑";
type BookBlockKind = "heading" | "paragraph" | "quote" | "list" | "rule";
type ReaderThemeId = "paper" | "white" | "night";
type ReaderLayout = "mobile" | "desktop";

type BookBlock = {
  id: string;
  text: string;
  kind: BookBlockKind;
  level?: number;
  continued?: boolean;
};

type ReaderTheme = {
  label: string;
  app: string;
  device: string;
  page: string;
  chrome: string;
  bottom: string;
  card: string;
  sheet: string;
  text: string;
  muted: string;
  rail: string;
  active: string;
  hover: string;
};

const bookTitle = "纪元";
const bookSubtitle = "王朔《纪元》";
const chapterTitle = "纪元";
const authorView = "王朔《纪元》的文本研究者，不代表作者本人，也不模拟真人发言";

const partners: DialoguePartner[] = [
  {
    id: "xzy",
    name: "许知远式",
    role: "文化追问",
    edge: "追问时代、身份和尴尬",
  },
  {
    id: "lwd",
    name: "梁文道式",
    role: "阅读分析",
    edge: "拆文本、典故和结构",
  },
  {
    id: "dwt",
    name: "窦文涛式",
    role: "圆桌访谈",
    edge: "把尖锐问题问得松弛",
  },
  {
    id: "ld",
    name: "李诞式",
    role: "喜剧观察",
    edge: "抓荒诞、冒犯和自嘲",
  },
];

const placeholderPassages: BookBlock[] = [
  {
    id: "placeholder",
    text: "《纪元》正文待导入。把你已有的 TXT/MD 文本粘贴到这里，书伴会在本机拆成可阅读段落。",
    kind: "paragraph",
  },
];

const initialNotes = [
  "《纪元》导入后，问书、对谈和笔记都会围绕当前选中的段落生成。",
  "对谈中的作者侧是文本研究者视角，不代表王朔本人真实发言。",
];

const depthLabels: Record<string, string> = {
  light: "轻松",
  deep: "深入",
  sharp: "尖锐",
};

const readerThemes: Record<ReaderThemeId, ReaderTheme> = {
  paper: {
    label: "纸页",
    app: "bg-[#20201e]",
    device: "bg-[#f4f1e8] text-[#2c2b28]",
    page: "bg-[#f4f1e8]",
    chrome: "border-[#ded8ca] bg-[#f7f5ee]/95",
    bottom: "border-[#ded8ca] bg-[#f7f5ee]/96",
    card: "border-[#dad3c4] bg-[#fbfaf4]",
    sheet: "border-[#d8d1c4] bg-[#fbfaf4]",
    text: "text-[#2f2d29]",
    muted: "text-[#777064]",
    rail: "bg-[#dfd8ca]",
    active: "bg-[#e8e1c8] shadow-[inset_3px_0_0_#1f8a70]",
    hover: "hover:bg-[#ebe5d6]",
  },
  white: {
    label: "白昼",
    app: "bg-[#1f2322]",
    device: "bg-[#f7f8f6] text-[#252b29]",
    page: "bg-[#f7f8f6]",
    chrome: "border-[#e1e4df] bg-[#fbfcfa]/95",
    bottom: "border-[#e1e4df] bg-[#fbfcfa]/96",
    card: "border-[#dfe4de] bg-white",
    sheet: "border-[#dde3dc] bg-[#fbfcfa]",
    text: "text-[#252b29]",
    muted: "text-[#737c76]",
    rail: "bg-[#dce3dc]",
    active: "bg-[#e4f0eb] shadow-[inset_3px_0_0_#1f8a70]",
    hover: "hover:bg-[#edf2ee]",
  },
  night: {
    label: "夜读",
    app: "bg-[#0f0f0e]",
    device: "bg-[#181815] text-[#d8d2c5]",
    page: "bg-[#181815]",
    chrome: "border-[#2b2a25] bg-[#1e1e1a]/95",
    bottom: "border-[#2b2a25] bg-[#1e1e1a]/96",
    card: "border-[#333126] bg-[#20201c]",
    sheet: "border-[#333126] bg-[#20201c]",
    text: "text-[#d8d2c5]",
    muted: "text-[#928b7d]",
    rail: "bg-[#333126]",
    active: "bg-[#34311f] shadow-[inset_3px_0_0_#36a98b]",
    hover: "hover:bg-[#24231e]",
  },
};

function classNames(...values: Array<string | false | undefined>) {
  return values.filter(Boolean).join(" ");
}

function cleanMarkdownInline(value: string) {
  return value
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const strongBreakMarks = "。！？!?；;";
const weakBreakMarks = "，,、：:";
const leadingPunctuation = "，,、。！？!?；;：:）)]】》」』’”";
const closingPunctuation = "）)]】》」』’”";

function isStrongBreakMark(value: string) {
  return strongBreakMarks.includes(value);
}

function isWeakBreakMark(value: string) {
  return weakBreakMarks.includes(value);
}

function isLeadingPunctuation(value: string) {
  return leadingPunctuation.includes(value);
}

function lastMeaningfulMark(line: string) {
  let text = line.trim();
  while (text && closingPunctuation.includes(text[text.length - 1])) {
    text = text.slice(0, -1).trimEnd();
  }
  return text[text.length - 1] ?? "";
}

function naturalBreakIndex(text: string, maxLength: number) {
  const softLimit = Math.min(text.length, maxLength + 10);
  const minUsefulLength = Math.floor(maxLength * 0.55);
  let strongCandidate = 0;
  let weakCandidate = 0;

  for (let index = 0; index < softLimit; index += 1) {
    if (index + 1 >= minUsefulLength && isStrongBreakMark(text[index])) {
      strongCandidate = index + 1;
    }
    if (index + 1 >= minUsefulLength && isWeakBreakMark(text[index])) {
      weakCandidate = index + 1;
    }
  }

  if (strongCandidate) return strongCandidate;
  if (weakCandidate) return weakCandidate;

  for (let index = maxLength; index > minUsefulLength; index -= 1) {
    if (isStrongBreakMark(text[index - 1])) return index;
  }

  for (let index = maxLength; index > minUsefulLength; index -= 1) {
    if (isWeakBreakMark(text[index - 1])) return index;
  }

  return Math.min(maxLength, text.length);
}

function splitOversizedText(text: string, maxLength: number) {
  const chunks: string[] = [];
  let rest = text.trim();

  while (rest.length > maxLength) {
    let boundary = naturalBreakIndex(rest, maxLength);
    while (boundary < rest.length && isLeadingPunctuation(rest[boundary])) {
      boundary += 1;
    }

    const chunk = rest.slice(0, boundary).trim();
    if (chunk) chunks.push(chunk);
    rest = rest.slice(boundary).trim();
  }

  if (rest) chunks.push(rest);
  return chunks;
}

function splitLongParagraph(text: string, maxLength = 68) {
  if (text.length <= maxLength) return [text];

  const sentences = text.match(/[^。！？!?；;]+[。！？!?；;]?/g) ?? [text];
  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences.map((item) => item.trim()).filter(Boolean)) {
    const pieces = sentence.length > maxLength ? splitOversizedText(sentence, maxLength) : [sentence];

    for (let piece of pieces) {
      if (!piece) continue;

      while (current && piece && isLeadingPunctuation(piece[0])) {
        current += piece[0];
        piece = piece.slice(1).trim();
      }

      if (!piece) continue;

      if ((current + piece).length > maxLength && current) {
        chunks.push(current);
        current = piece;
      } else {
        current += piece;
      }
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

function hasSourceParagraphIndent(line: string) {
  return /^\s*\u3000/.test(line) || /^( {4,}|\t+)\S/.test(line);
}

function endsSourceParagraph(line: string) {
  const mark = lastMeaningfulMark(line);
  return Boolean(mark && isStrongBreakMark(mark));
}

function continuesSourceParagraph(line: string | undefined) {
  if (!line) return false;
  const mark = lastMeaningfulMark(line);
  return !mark || isWeakBreakMark(mark) || !isStrongBreakMark(mark);
}

function shouldStartSourceParagraph(previousLine: string | undefined, currentLine: string) {
  if (!previousLine || !currentLine) return false;
  return endsSourceParagraph(previousLine) && !isLeadingPunctuation(currentLine[0]);
}

function normalizeParsedBlocks(blocks: BookBlock[]) {
  const normalized: BookBlock[] = [];

  for (const block of blocks) {
    if (!block.text) {
      normalized.push(block);
      continue;
    }

    let text = block.text;
    const previousTextBlock = [...normalized]
      .reverse()
      .find((item) => item.text && item.kind !== "heading");

    while (text && previousTextBlock && isLeadingPunctuation(text[0])) {
      previousTextBlock.text += text[0];
      text = text.slice(1).trimStart();
    }

    if (!text) continue;
    normalized.push({ ...block, text });
  }

  return normalized;
}

function parseBookText(raw: string): BookBlock[] {
  const normalized = raw
    .replace(/\r/g, "")
    .replace(/^---\n[\s\S]*?\n---\n?/, "")
    .trim();
  if (!normalized) return [];

  const blocks: BookBlock[] = [];
  const paragraphBuffer: string[] = [];
  let counter = 1;
  let inCodeFence = false;

  const pushBlock = (kind: BookBlockKind, text = "", level?: number, continued = false) => {
    blocks.push({
      id: `jiyuan-${counter}`,
      text,
      kind,
      level,
      continued,
    });
    counter += 1;
  };

  const pushParagraph = () => {
    const text = cleanMarkdownInline(paragraphBuffer.join(" "));
    paragraphBuffer.length = 0;
    if (!text) return;
    const chunks = splitLongParagraph(text);
    chunks.forEach((chunk, index) => {
      pushBlock("paragraph", chunk, undefined, index > 0);
    });
  };

  for (const line of normalized.split("\n")) {
    const trimmed = line.trim();

    if (/^```/.test(trimmed)) {
      inCodeFence = !inCodeFence;
      continue;
    }

    if (inCodeFence) continue;

    if (!trimmed) {
      if (!continuesSourceParagraph(paragraphBuffer.at(-1))) {
        pushParagraph();
      }
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.+?)\s*#*$/);
    if (heading) {
      pushParagraph();
      pushBlock("heading", cleanMarkdownInline(heading[2]), heading[1].length);
      continue;
    }

    if (/^([-*_])\1{2,}$/.test(trimmed)) {
      pushParagraph();
      pushBlock("rule");
      continue;
    }

    const quote = trimmed.match(/^>\s*(.+)$/);
    if (quote) {
      pushParagraph();
      pushBlock("quote", cleanMarkdownInline(quote[1]));
      continue;
    }

    const listItem = trimmed.match(/^([-*+]|\d+[.)])\s+(.+)$/);
    if (listItem) {
      pushParagraph();
      pushBlock("list", cleanMarkdownInline(listItem[2]));
      continue;
    }

    if (
      paragraphBuffer.length &&
      !continuesSourceParagraph(paragraphBuffer.at(-1)) &&
      (hasSourceParagraphIndent(line) || shouldStartSourceParagraph(paragraphBuffer.at(-1), trimmed))
    ) {
      pushParagraph();
    }

    paragraphBuffer.push(trimmed);
  }

  pushParagraph();

  if (blocks.some((item) => item.text || item.kind === "rule")) return normalizeParsedBlocks(blocks);

  return normalizeParsedBlocks(splitLongParagraph(cleanMarkdownInline(normalized)).map((text, index) => ({
    id: `jiyuan-${index + 1}`,
    text,
    kind: "paragraph",
    continued: index > 0,
  })));
}

function firstSelectableId(blocks: BookBlock[]) {
  return (
    blocks.find((item) => ["paragraph", "quote", "list"].includes(item.kind))?.id ??
    blocks.find((item) => item.kind !== "rule")?.id ??
    placeholderPassages[0].id
  );
}

function readingBlockClass(block: BookBlock, highlighted: boolean, theme: ReaderTheme) {
  const marked = highlighted ? "bg-[#f4df8c]/35" : "";

  if (block.kind === "heading") {
    return classNames(
      "block w-full rounded-[8px] px-1.5 text-left transition",
      theme.text,
      block.level === 1
        ? "mb-6 mt-10 font-semibold leading-[1.35]"
        : block.level === 2
          ? "mb-5 mt-9 font-semibold leading-[1.42]"
          : "mb-3 mt-7 font-semibold leading-[1.5]",
      marked,
    );
  }

  if (block.kind === "quote") {
    return classNames(
      "my-5 block w-full border-l-2 border-[#bda96b] px-4 py-2 text-left leading-[1.95] transition",
      theme.muted,
      marked,
    );
  }

  if (block.kind === "list") {
    return classNames(
      "my-1 block w-full rounded-[8px] px-3 py-2 text-left leading-[1.9] transition",
      theme.text,
      marked,
    );
  }

  return classNames(
    "block w-full rounded-[8px] px-1.5 py-1 text-left tracking-[0.01em] transition",
    theme.text,
    marked,
  );
}

function readingBlockStyle(block: BookBlock, fontSize: number, lineHeight: number): CSSProperties {
  if (block.kind === "heading") {
    const headingSize = block.level === 1 ? fontSize + 9 : block.level === 2 ? fontSize + 5 : fontSize + 2;
    return { fontSize: `${headingSize}px` };
  }

  return {
    fontSize: `${block.kind === "quote" || block.kind === "list" ? fontSize - 1 : fontSize}px`,
    lineHeight,
  };
}

function shouldIndentBlock(block: BookBlock) {
  return block.kind === "paragraph" && !block.continued;
}

function blockPageWeight(block: BookBlock, fontSize: number, layout: ReaderLayout) {
  if (block.kind === "rule") return 1.2;
  if (block.kind === "heading") return block.level === 1 ? 3.4 : block.level === 2 ? 2.8 : 2.2;

  const contentWidth = layout === "mobile" ? 342 : 690;
  const averageCharWidth = fontSize * (layout === "mobile" ? 1.05 : 0.92);
  const charsPerLine = Math.max(8, Math.floor(contentWidth / averageCharWidth));
  const indentChars = block.kind === "paragraph" ? 2 : 0;
  const textLines = Math.max(1, Math.ceil((block.text.length + indentChars) / charsPerLine));

  if (block.kind === "quote") return textLines + 0.9;
  if (block.kind === "list") return textLines + 0.7;
  return textLines + 0.55;
}

function pageCapacity(fontSize: number, lineHeight: number, layout: ReaderLayout) {
  const visibleHeight = layout === "mobile" ? 472 : 760;
  const usableLines = visibleHeight / (fontSize * lineHeight);
  return Math.max(layout === "mobile" ? 7.2 : 12, usableLines);
}

function paginateBookBlocks(
  blocks: BookBlock[],
  fontSize: number,
  lineHeight: number,
  layout: ReaderLayout,
) {
  const capacity = pageCapacity(fontSize, lineHeight, layout);
  const pages: BookBlock[][] = [];
  let current: BookBlock[] = [];
  let currentWeight = 0;

  for (const block of blocks) {
    const weight = blockPageWeight(block, fontSize, layout);
    const shouldStartHeadingPage =
      block.kind === "heading" && block.level && block.level <= 2 && current.length > 1;

    if (current.length && (currentWeight + weight > capacity || shouldStartHeadingPage)) {
      pages.push(current);
      current = [];
      currentWeight = 0;
    }

    current.push(block);
    currentWeight += weight;
  }

  if (current.length) pages.push(current);
  return pages.length ? pages : [placeholderPassages];
}

function findPageIndexForBlock(pages: BookBlock[][], blockId: string) {
  const pageIndex = pages.findIndex((page) => page.some((block) => block.id === blockId));
  return pageIndex >= 0 ? pageIndex : 0;
}

function pagesSignature(pages: BookBlock[][]) {
  return pages.map((page) => page.map((block) => block.id).join(",")).join("|");
}

function paginateMeasuredBookBlocks(
  blocks: BookBlock[],
  measuredHeights: Map<string, number>,
  capacity: number,
) {
  const safeCapacity = Math.max(160, capacity - 8);
  const pages: BookBlock[][] = [];
  let current: BookBlock[] = [];
  let currentHeight = 0;

  for (const block of blocks) {
    const height = measuredHeights.get(block.id) ?? 0;
    const shouldStartHeadingPage =
      block.kind === "heading" && block.level && block.level <= 2 && currentHeight > safeCapacity * 0.35;

    if (current.length && (currentHeight + height > safeCapacity || shouldStartHeadingPage)) {
      pages.push(current);
      current = [];
      currentHeight = 0;
    }

    current.push(block);
    currentHeight += height;
  }

  if (current.length) pages.push(current);
  return pages.length ? pages : [placeholderPassages];
}

export default function BookCompanion() {
  const mobileReaderRef = useRef<HTMLDivElement>(null);
  const mobileMeasureRef = useRef<HTMLDivElement>(null);
  const [passages, setPassages] = useState(placeholderPassages);
  const [selectedPassage, setSelectedPassage] = useState(placeholderPassages[0].id);
  const [partner, setPartner] = useState(partners[0].id);
  const [length, setLength] = useState("10");
  const [depth, setDepth] = useState("sharp");
  const [panel, setPanel] = useState<Panel>("ask");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectionToolsOpen, setSelectionToolsOpen] = useState(false);
  const [question, setQuestion] = useState("这段话和《纪元》的主题有什么关系？");
  const [companionAnswer, setCompanionAnswer] = useState("");
  const [dialogueTranscript, setDialogueTranscript] = useState("");
  const [notes, setNotes] = useState(initialNotes);
  const [highlightedIds, setHighlightedIds] = useState<string[]>([]);
  const [importText, setImportText] = useState("");
  const [themeId, setThemeId] = useState<ReaderThemeId>("night");
  const [fontSize, setFontSize] = useState(20);
  const [lineHeight, setLineHeight] = useState(2.05);
  const [pageIndex, setPageIndex] = useState(0);
  const [activeLayout, setActiveLayout] = useState<ReaderLayout>("mobile");
  const [measuredMobilePages, setMeasuredMobilePages] = useState<BookBlock[][] | null>(null);
  const [asking, setAsking] = useState(false);
  const [generatingDialogue, setGeneratingDialogue] = useState(false);
  const [error, setError] = useState("");

  const theme = readerThemes[themeId];

  const selectedPartner = useMemo(
    () => partners.find((item) => item.id === partner) ?? partners[0],
    [partner],
  );

  const activePassage = useMemo(
    () =>
      passages.find((item) => item.id === selectedPassage) ??
      passages.find((item) => item.kind !== "rule") ??
      passages[0],
    [passages, selectedPassage],
  );

  const hasImportedText = passages[0]?.id !== "placeholder";
  const readingTitle =
    (hasImportedText && passages.find((item) => item.kind === "heading")?.text) || chapterTitle;
  const visiblePassages = useMemo(
    () =>
      passages.filter(
        (passage, index) =>
          !(index === 0 && passage.kind === "heading" && passage.text === readingTitle),
      ),
    [passages, readingTitle],
  );
  const estimatedMobilePages = useMemo(
    () => paginateBookBlocks(visiblePassages, fontSize, lineHeight, "mobile"),
    [fontSize, lineHeight, visiblePassages],
  );
  const mobilePages = useMemo(
    () => measuredMobilePages ?? estimatedMobilePages,
    [estimatedMobilePages, measuredMobilePages],
  );
  const desktopPages = useMemo(
    () => paginateBookBlocks(passages, fontSize, lineHeight, "desktop"),
    [fontSize, lineHeight, passages],
  );
  const mobileSafePageIndex = Math.min(pageIndex, Math.max(mobilePages.length - 1, 0));
  const desktopSafePageIndex = Math.min(pageIndex, Math.max(desktopPages.length - 1, 0));
  const currentMobilePageBlocks =
    mobilePages[mobileSafePageIndex] ?? mobilePages[0] ?? placeholderPassages;
  const currentDesktopPageBlocks =
    desktopPages[desktopSafePageIndex] ?? desktopPages[0] ?? placeholderPassages;
  const readableBlockCount = passages.filter((item) => item.kind !== "rule").length;
  const mobileReadingProgress = hasImportedText
    ? Math.max(1, Math.round(((mobileSafePageIndex + 1) / Math.max(mobilePages.length, 1)) * 100))
    : 0;
  const desktopReadingProgress = hasImportedText
    ? Math.max(1, Math.round(((desktopSafePageIndex + 1) / Math.max(desktopPages.length, 1)) * 100))
    : 0;
  const tocItems = useMemo(
    () => passages.filter((item) => item.kind === "heading" && item.text.trim()),
    [passages],
  );

  const dialogueContext = useMemo(() => {
    const readable = passages.filter((item) => item.kind !== "rule" && item.text.trim());
    const activeIndex = readable.findIndex((item) => item.id === activePassage.id);
    const start = activeIndex >= 0 ? Math.max(0, activeIndex - 4) : 0;
    return readable.slice(start, start + 12).map((item) => item.text);
  }, [activePassage.id, passages]);

  useEffect(() => {
    window.scrollTo({ left: 0, top: 0 });
    const id = window.setTimeout(() => {
      const saved = window.localStorage.getItem("book-companion:jiyuan:text");
      if (saved) {
        const next = parseBookText(saved);
        if (next.length) {
          setImportText(saved);
          setPassages(next);
          setSelectedPassage(firstSelectableId(next));
          setPageIndex(0);
        }
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    let frame = 0;
    const measure = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const reader = mobileReaderRef.current;
        const measurer = mobileMeasureRef.current;
        if (!reader || !measurer || !visiblePassages.length) return;

        const measuredHeights = new Map<string, number>();
        for (const element of Array.from(measurer.querySelectorAll<HTMLElement>("[data-book-block-id]"))) {
          const style = window.getComputedStyle(element);
          const marginTop = Number.parseFloat(style.marginTop) || 0;
          const marginBottom = Number.parseFloat(style.marginBottom) || 0;
          measuredHeights.set(
            element.dataset.bookBlockId ?? "",
            element.getBoundingClientRect().height + marginTop + marginBottom,
          );
        }

        const nextPages = paginateMeasuredBookBlocks(
          visiblePassages,
          measuredHeights,
          reader.getBoundingClientRect().height,
        );

        setMeasuredMobilePages((current) =>
          current && pagesSignature(current) === pagesSignature(nextPages) ? current : nextPages,
        );
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    if (mobileReaderRef.current) observer.observe(mobileReaderRef.current);
    if (mobileMeasureRef.current) observer.observe(mobileMeasureRef.current);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [fontSize, lineHeight, themeId, visiblePassages]);

  function openDrawer(nextPanel: Panel, layout: ReaderLayout = activeLayout) {
    setActiveLayout(layout);
    setPanel(nextPanel);
    setDrawerOpen(true);
    setSelectionToolsOpen(false);
  }

  function cycleTheme() {
    const order: ReaderThemeId[] = ["night", "paper", "white"];
    const index = order.indexOf(themeId);
    setThemeId(order[(index + 1) % order.length]);
  }

  function pagesForLayout(layout: ReaderLayout) {
    return layout === "mobile" ? mobilePages : desktopPages;
  }

  function goToPage(nextPageIndex: number, layout: ReaderLayout = activeLayout) {
    const targetPages = pagesForLayout(layout);
    const next = Math.min(Math.max(nextPageIndex, 0), Math.max(targetPages.length - 1, 0));
    const nextPage = targetPages[next] ?? targetPages[0] ?? placeholderPassages;
    setActiveLayout(layout);
    setPageIndex(next);
    setSelectedPassage(firstSelectableId(nextPage));
    setSelectionToolsOpen(false);
    setDrawerOpen(false);
  }

  function selectBlock(block: BookBlock, layout: ReaderLayout = activeLayout) {
    if (block.kind === "rule") return;
    const targetPages = pagesForLayout(layout);
    setActiveLayout(layout);
    setSelectedPassage(block.id);
    setPageIndex(findPageIndexForBlock(targetPages, block.id));
    setSelectionToolsOpen(true);
  }

  function importJiyuanText(raw = importText) {
    const next = parseBookText(raw);
    if (!next.length) {
      setError("没有识别到可导入的正文。请粘贴 TXT/MD 文本，至少包含一段完整内容。");
      return;
    }
    window.localStorage.setItem("book-companion:jiyuan:text", raw.trim());
    setPassages(next);
    setSelectedPassage(firstSelectableId(next));
    setPageIndex(0);
    setSelectionToolsOpen(false);
    setCompanionAnswer("");
    setDialogueTranscript("");
    setError("");
  }

  function reflowImportedText() {
    const raw = importText || window.localStorage.getItem("book-companion:jiyuan:text") || "";
    const next = parseBookText(raw);
    if (!next.length) {
      setError("没有可重新整理的正文。请先导入 TXT/MD 文本。");
      return;
    }
    setImportText(raw);
    setPassages(next);
    setSelectedPassage(firstSelectableId(next));
    setPageIndex(0);
    setMeasuredMobilePages(null);
    setSelectionToolsOpen(false);
    setDrawerOpen(false);
    setError("");
  }

  async function handleTextFile(file?: File) {
    if (!file) return;
    const text = await file.text();
    setImportText(text);
    importJiyuanText(text);
  }

  function clearImportedText() {
    window.localStorage.removeItem("book-companion:jiyuan:text");
    setPassages(placeholderPassages);
    setSelectedPassage(placeholderPassages[0].id);
    setPageIndex(0);
    setImportText("");
    setSelectionToolsOpen(false);
    setCompanionAnswer("");
    setDialogueTranscript("");
  }

  function toggleHighlight() {
    setHighlightedIds((items) =>
      items.includes(activePassage.id)
        ? items.filter((id) => id !== activePassage.id)
        : [...items, activePassage.id],
    );
  }

  function saveSelectionAsNote() {
    const text = activePassage.text.trim();
    if (!text) return;
    setNotes((items) => [`摘录：${text.slice(0, 180)}${text.length > 180 ? "..." : ""}`, ...items]);
    openDrawer("notes");
  }

  async function askCompanion(mode: CompanionMode, nextQuestion = question) {
    const cleanQuestion = nextQuestion.trim();
    if (!cleanQuestion || asking) return;

    openDrawer("ask");
    setQuestion(cleanQuestion);
    setAsking(true);
    setError("");
    setCompanionAnswer("");

    try {
      const response = await fetch("/api/book/companion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapterTitle,
          passage: activePassage.text,
          question: cleanQuestion,
          mode,
          notes,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        answer?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || "陪读回答生成失败");
      setCompanionAnswer(data.answer?.trim() || "这段可以理解为一种对体面话术的怀疑。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "陪读回答生成失败");
    } finally {
      setAsking(false);
    }
  }

  async function generateDialogue() {
    if (generatingDialogue) return;

    openDrawer("dialogue");
    setGeneratingDialogue(true);
    setError("");
    setDialogueTranscript("");

    try {
      const response = await fetch("/api/book/dialogue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapterTitle,
          passages: dialogueContext,
          selectedPassage: activePassage.text,
          authorView,
          partner: selectedPartner,
          length,
          depth,
          notes,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        transcript?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || "对谈生成失败");
      setDialogueTranscript(data.transcript?.trim() || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "对谈生成失败");
    } finally {
      setGeneratingDialogue(false);
    }
  }

  function saveAnswerAsNote() {
    const text = companionAnswer.trim();
    if (!text) return;
    setNotes((items) => [text, ...items]);
    openDrawer("notes");
  }

  function saveDialogueAsNote() {
    const text = dialogueTranscript.trim();
    if (!text) return;
    setNotes((items) => [`本章对谈：${text.slice(0, 180)}${text.length > 180 ? "..." : ""}`, ...items]);
    openDrawer("notes");
  }

  function renderReadingBlocks(blocks: BookBlock[], layout: ReaderLayout, currentPageIndex: number) {
    return blocks.map((passage, index) => {
      const highlighted = highlightedIds.includes(passage.id);
      if (currentPageIndex === 0 && index === 0 && passage.kind === "heading" && passage.text === readingTitle) {
        return null;
      }
      if (passage.kind === "rule") {
        return <div key={passage.id} className="mx-auto my-9 h-px w-24 bg-current/20" />;
      }
      return (
        <button
          key={passage.id}
          type="button"
          onClick={() => selectBlock(passage, layout)}
          style={readingBlockStyle(passage, fontSize, lineHeight)}
          className={classNames(
            passage.continued ? "mb-0 break-inside-avoid" : "mb-3 break-inside-avoid",
            readingBlockClass(passage, highlighted, theme),
          )}
        >
          {passage.kind === "list" && (
            <span className="mr-2 font-semibold text-[#1f8a70]">•</span>
          )}
          {shouldIndentBlock(passage) && (
            <span aria-hidden="true" className="inline-block w-[2em]" />
          )}
          <span>{passage.text}</span>
        </button>
      );
    });
  }

  function renderMeasuredBlocks(blocks: BookBlock[]) {
    return blocks.map((passage) => {
      const highlighted = highlightedIds.includes(passage.id);
      if (passage.kind === "rule") {
        return (
          <div
            key={passage.id}
            data-book-block-id={passage.id}
            className="mx-auto my-9 h-px w-24 bg-current/20"
          />
        );
      }

      return (
        <div
          key={passage.id}
          data-book-block-id={passage.id}
          style={readingBlockStyle(passage, fontSize, lineHeight)}
          className={classNames(
            passage.continued ? "mb-0 break-inside-avoid" : "mb-3 break-inside-avoid",
            readingBlockClass(passage, highlighted, theme),
          )}
        >
          {passage.kind === "list" && (
            <span className="mr-2 font-semibold text-[#1f8a70]">•</span>
          )}
          {shouldIndentBlock(passage) && (
            <span aria-hidden="true" className="inline-block w-[2em]" />
          )}
          <span>{passage.text}</span>
        </div>
      );
    });
  }

  return (
    <main className={classNames("min-h-screen px-0 pb-0 md:grid md:place-items-center md:px-6 md:py-8", theme.app)}>
      <header className="hidden">
        <div className={classNames("flex min-w-0 items-center gap-4", theme.muted)}>
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-[7px] bg-white text-[#232323]">
            书
          </div>
          <div className="min-w-0">
            <div className="truncate text-[22px] font-semibold">起初 · {readingTitle}</div>
            <div className="mt-0.5 truncate text-xs font-medium opacity-70">{bookSubtitle}</div>
          </div>
          <button
            type="button"
            onClick={() => openDrawer("toc", "desktop")}
            className={classNames("hidden h-9 w-9 place-items-center rounded-full text-lg md:grid", theme.hover)}
            aria-label="目录"
          >
            ☰
          </button>
        </div>
        <div className={classNames("hidden items-center gap-5 text-[17px] font-semibold md:flex", theme.muted)}>
          <button type="button" className={theme.hover}>首页</button>
          <span className="h-5 w-px bg-current/25" />
          <button type="button" className={theme.hover}>我的书架</button>
          <div className="grid h-9 w-9 place-items-center rounded-full bg-[#c59b61] text-sm text-white">我</div>
        </div>
      </header>

      <section className="relative mx-auto w-full md:max-w-[430px]">
        <article
          className={classNames(
            "relative min-h-[100dvh] overflow-hidden px-6 pb-[150px] md:min-h-[calc(100vh-64px)] md:rounded-[32px] md:shadow-2xl md:shadow-black/40",
            theme.page,
          )}
        >
          <div
            className={classNames(
              "sticky top-0 z-20 -mx-6 flex h-[58px] items-center justify-between border-b border-current/10 px-4 backdrop-blur",
              theme.page,
            )}
          >
            <button
              type="button"
              onClick={() => openDrawer("toc", "mobile")}
              className={classNames("grid h-10 w-10 place-items-center rounded-full text-xl", theme.hover)}
              aria-label="目录"
            >
              ☰
            </button>
            <div className="min-w-0 px-2 text-center">
              <div className={classNames("truncate text-[16px] font-semibold", theme.text)}>
                {readingTitle}
              </div>
              <div className={classNames("mt-0.5 text-[11px]", theme.muted)}>
                {hasImportedText ? `${mobileSafePageIndex + 1} / ${mobilePages.length}` : bookSubtitle}
              </div>
            </div>
            <button
              type="button"
              onClick={() => openDrawer("settings", "mobile")}
              className={classNames("grid h-10 w-10 place-items-center rounded-full text-[17px] font-semibold", theme.hover)}
              aria-label="设置"
            >
              A
            </button>
          </div>

          <div className={classNames("mt-5 flex items-center justify-between text-[12px]", theme.muted)}>
            <span>{mobileSafePageIndex + 1}</span>
            <span>{mobileReadingProgress}%</span>
          </div>

          {!hasImportedText && (
            <div className="mb-6 mt-6 text-center">
              <p className={classNames("text-xs font-semibold uppercase tracking-[0.2em]", theme.muted)}>
                Wang Shuo Reader
              </p>
              <h1 className={classNames("mx-auto mt-3 max-w-[13em] text-[30px] font-semibold leading-tight", theme.text)}>
                {readingTitle}
              </h1>
              <div className={classNames("mt-3 text-xs", theme.muted)}>
                {hasImportedText ? `${readableBlockCount} 个阅读块 · ${mobilePages.length} 页` : "等待导入正文"}
              </div>
            </div>
          )}

          {!hasImportedText && (
            <div className={classNames("mx-auto max-w-xl rounded-[18px] border p-4", theme.card)}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className={classNames("text-sm font-semibold", theme.text)}>{bookTitle} 正文</p>
                  <p className={classNames("mt-1 text-xs leading-relaxed", theme.muted)}>
                    导入 TXT 或 Markdown 后进入阅读器。
                  </p>
                </div>
              </div>
              <div className="mt-3 space-y-3">
                <textarea
                  value={importText}
                  onChange={(event) => setImportText(event.target.value)}
                  placeholder="粘贴《纪元》正文片段或章节文本..."
                  className="min-h-28 w-full resize-none rounded-[14px] border border-current/10 bg-transparent px-3 py-3 text-sm leading-relaxed outline-none placeholder:text-current/35"
                />
                <div className="flex gap-2">
                  <label className={classNames("grid h-11 flex-1 cursor-pointer place-items-center rounded-[14px] border text-sm font-semibold", theme.card)}>
                    选择 TXT/MD
                    <input
                      type="file"
                      accept=".txt,.md,text/plain,text/markdown"
                      className="sr-only"
                      onChange={(event) => void handleTextFile(event.target.files?.[0])}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => importJiyuanText()}
                    className="h-11 flex-1 rounded-[14px] bg-[#1f8a70] text-sm font-semibold text-white"
                  >
                    载入阅读
                  </button>
                </div>
              </div>
            </div>
          )}

          {hasImportedText && (
            <div
              ref={mobileReaderRef}
              className="h-[calc(100dvh-282px)] overflow-hidden px-1 pb-4 md:h-[calc(100vh-314px)]"
            >
              {renderReadingBlocks(currentMobilePageBlocks, "mobile", mobileSafePageIndex)}
            </div>
          )}

          {hasImportedText && (
            <div
              ref={mobileMeasureRef}
              aria-hidden="true"
              className="pointer-events-none absolute left-6 right-6 top-24 opacity-0"
              style={{ visibility: "hidden" }}
            >
              {renderMeasuredBlocks(visiblePassages)}
            </div>
          )}
        </article>

        <article
          className={classNames(
            "hidden",
            theme.page,
          )}
        >
          <div className={classNames("pointer-events-none absolute right-10 top-0 h-16 w-6 border-x border-b border-current/20", theme.muted)} />

          <div className={classNames("mb-10 flex items-center justify-between text-sm", theme.muted)}>
            <span>{desktopSafePageIndex + 1}</span>
            <span>{desktopReadingProgress}%</span>
          </div>

          {!hasImportedText && (
            <div className={classNames("mx-auto max-w-xl rounded-[18px] border p-4", theme.card)}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className={classNames("text-sm font-semibold", theme.text)}>{bookTitle} 正文</p>
                  <p className={classNames("mt-1 text-xs leading-relaxed", theme.muted)}>
                    导入 TXT 或 Markdown 后进入阅读器。
                  </p>
                </div>
              </div>
              <div className="mt-3 space-y-3">
                <textarea
                  value={importText}
                  onChange={(event) => setImportText(event.target.value)}
                  placeholder="粘贴《纪元》正文片段或章节文本..."
                  className="min-h-28 w-full resize-none rounded-[14px] border border-current/10 bg-transparent px-3 py-3 text-sm leading-relaxed outline-none placeholder:text-current/35"
                />
                <div className="flex gap-2">
                  <label className={classNames("grid h-11 flex-1 cursor-pointer place-items-center rounded-[14px] border text-sm font-semibold", theme.card)}>
                    选择 TXT/MD
                    <input
                      type="file"
                      accept=".txt,.md,text/plain,text/markdown"
                      className="sr-only"
                      onChange={(event) => void handleTextFile(event.target.files?.[0])}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => importJiyuanText()}
                    className="h-11 flex-1 rounded-[14px] bg-[#1f8a70] text-sm font-semibold text-white"
                  >
                    载入阅读
                  </button>
                </div>
              </div>
            </div>
          )}

          {hasImportedText && (
            <div className="h-[calc(100%-176px)] overflow-hidden pb-4 md:columns-2 md:gap-[108px]">
              {renderReadingBlocks(currentDesktopPageBlocks, "desktop", desktopSafePageIndex)}
            </div>
          )}

          <div className="absolute bottom-6 left-7 right-7 flex items-center justify-between md:left-[96px] md:right-[96px]">
            <button
              type="button"
              onClick={() => goToPage(desktopSafePageIndex - 1, "desktop")}
              disabled={desktopSafePageIndex <= 0}
              className={classNames("rounded-full border border-current/15 px-4 py-2 text-sm font-semibold disabled:opacity-35", theme.muted, theme.hover)}
            >
              ‹ 上一页
            </button>
            <button
              type="button"
              onClick={() => goToPage(desktopSafePageIndex + 1, "desktop")}
              disabled={desktopSafePageIndex >= desktopPages.length - 1}
              className={classNames("rounded-full border border-current/15 px-4 py-2 text-sm font-semibold disabled:opacity-35", theme.muted, theme.hover)}
            >
              下一页 ›
            </button>
          </div>

          {selectionToolsOpen && hasImportedText && !drawerOpen && (
            <div className="absolute inset-x-0 bottom-16 z-40 flex justify-center">
              <div className={classNames("flex items-center justify-between rounded-full border px-2 py-2 shadow-lg shadow-black/20 backdrop-blur", theme.sheet)}>
                {[
                  ["划线", toggleHighlight],
                  ["笔记", saveSelectionAsNote],
                  ["问书", () => void askCompanion("解释")],
                  ["对谈", () => void generateDialogue()],
                  ["听书", () => openDrawer("listen", "desktop")],
                ].map(([label, action]) => (
                  <button
                    key={label as string}
                    type="button"
                    onClick={action as () => void}
                    className={classNames("min-w-0 rounded-full px-4 py-2 text-sm font-semibold", theme.hover)}
                  >
                    {label as string}
                  </button>
                ))}
              </div>
            </div>
          )}
        </article>

        <aside className="hidden">
          {[
            ["☰", "目录", () => openDrawer("toc", "desktop")],
            ["A↟", "放大", () => setFontSize((value) => Math.min(26, value + 1))],
            ["✦", "问书", () => openDrawer("ask", "desktop")],
            ["▤", "笔记", () => openDrawer("notes", "desktop")],
            ["A", "缩小", () => setFontSize((value) => Math.max(16, value - 1))],
            ["☼", "背景", cycleTheme],
          ].map(([icon, label, action]) => (
            <button
              key={label as string}
              type="button"
              onClick={action as () => void}
              title={label as string}
              className="grid h-[68px] w-[68px] place-items-center rounded-full bg-black/28 text-[24px] font-semibold text-white/55 transition hover:bg-black/40 hover:text-white"
            >
              {icon as string}
            </button>
          ))}
        </aside>

        {selectionToolsOpen && hasImportedText && !drawerOpen && activeLayout === "mobile" && (
          <div className="fixed inset-x-3 bottom-[138px] z-40 md:left-1/2 md:right-auto md:w-full md:max-w-[430px] md:-translate-x-1/2">
            <div
              className={classNames(
                "mx-auto grid max-w-[430px] grid-cols-5 rounded-full border px-2 py-2 text-center text-[13px] font-semibold shadow-lg shadow-black/25 backdrop-blur",
                theme.sheet,
              )}
            >
              {[
                ["划线", toggleHighlight],
                ["笔记", saveSelectionAsNote],
                ["问书", () => void askCompanion("解释")],
                ["对谈", () => void generateDialogue()],
                ["听书", () => openDrawer("listen", "mobile")],
              ].map(([label, action]) => (
                <button
                  key={label as string}
                  type="button"
                  onClick={action as () => void}
                  className={classNames("rounded-full px-2 py-2", theme.hover)}
                >
                  {label as string}
                </button>
              ))}
            </div>
          </div>
        )}

        <div
          className={classNames(
            "fixed inset-x-0 bottom-0 z-30 border-t px-4 pb-[calc(env(safe-area-inset-bottom)+10px)] pt-3 text-center text-xs backdrop-blur transition-transform md:left-1/2 md:right-auto md:w-full md:max-w-[430px] md:-translate-x-1/2 md:rounded-t-[24px]",
            drawerOpen && "translate-y-full",
            theme.bottom,
          )}
        >
          <div className="mx-auto max-w-[430px]">
            <div className="mb-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <button
                type="button"
                onClick={() => goToPage(mobileSafePageIndex - 1, "mobile")}
                disabled={mobileSafePageIndex <= 0}
                className={classNames("h-11 rounded-full border border-current/15 px-4 text-sm font-semibold disabled:opacity-35", theme.hover)}
              >
                ‹ 上页
              </button>
              <div className={classNames("min-w-[72px] rounded-full bg-current/10 px-3 py-2 text-[12px] font-semibold", theme.muted)}>
                {mobileSafePageIndex + 1}/{mobilePages.length}
              </div>
              <button
                type="button"
                onClick={() => goToPage(mobileSafePageIndex + 1, "mobile")}
                disabled={mobileSafePageIndex >= mobilePages.length - 1}
                className={classNames("h-11 rounded-full border border-current/15 px-4 text-sm font-semibold disabled:opacity-35", theme.hover)}
              >
                下页 ›
              </button>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {[
                ["☰", "目录", () => openDrawer("toc", "mobile")],
                ["A-", "缩小", () => setFontSize((value) => Math.max(16, value - 1))],
                ["A+", "放大", () => setFontSize((value) => Math.min(26, value + 1))],
                ["☼", "背景", cycleTheme],
                ["✦", "问书", () => openDrawer("ask", "mobile")],
              ].map(([icon, label, action]) => (
                <button
                  key={label as string}
                  type="button"
                  onClick={action as () => void}
                  className={classNames("rounded-[14px] py-2", theme.hover)}
                >
                  <span className="block text-[17px] leading-5">{icon as string}</span>
                  <span className={classNames("mt-0.5 block", theme.muted)}>{label as string}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {drawerOpen && (
          <section
            className={classNames(
              "fixed inset-x-0 bottom-0 z-50 max-h-[72vh] overflow-y-auto rounded-t-[22px] border-t px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-2 shadow-2xl shadow-black/25 md:left-1/2 md:right-auto md:w-full md:max-w-[430px] md:-translate-x-1/2 md:pb-4",
              theme.sheet,
            )}
          >
            <div className="sticky top-0 z-10 -mx-4 mb-3 border-b border-current/10 px-4 pb-3 backdrop-blur">
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-current/20" />
              <div className="flex items-center justify-between gap-3">
                <div className="flex flex-1 gap-1 overflow-x-auto rounded-full bg-current/10 p-1 text-sm font-medium">
                  {[
                    ["toc", "目录"],
                    ["listen", "听书"],
                    ["ask", "问书"],
                    ["dialogue", "对谈"],
                    ["notes", "笔记"],
                    ["settings", "设置"],
                  ].map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setPanel(id as Panel)}
                      className={classNames(
                        "shrink-0 rounded-full px-3 py-2 transition",
                        panel === id && "bg-[#1f8a70] text-white shadow-sm",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className={classNames("grid h-9 w-9 shrink-0 place-items-center rounded-full", theme.hover)}
                  aria-label="收起"
                >
                  ×
                </button>
              </div>
            </div>

            {error && (
              <div className="mb-3 rounded-[14px] border border-[#d86f5d] bg-[#fff1ed] px-4 py-3 text-sm text-[#9f3d2e]">
                {error}
              </div>
            )}

            {panel === "toc" && (
              <div className="space-y-2">
                {tocItems.length ? (
                  tocItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setSelectedPassage(item.id);
                        setPageIndex(findPageIndexForBlock(pagesForLayout(activeLayout), item.id));
                        setDrawerOpen(false);
                        setSelectionToolsOpen(false);
                      }}
                      className={classNames(
                        "block w-full rounded-[14px] border px-4 py-3 text-left transition",
                        theme.card,
                        selectedPassage === item.id && "border-[#1f8a70]",
                      )}
                    >
                      <span
                        className={classNames(
                          "block font-semibold",
                          item.level === 1 ? "text-base" : "text-sm",
                          theme.text,
                        )}
                      >
                        {item.text}
                      </span>
                    </button>
                  ))
                ) : (
                  <div className={classNames("rounded-[14px] border px-4 py-3 text-sm", theme.card, theme.muted)}>
                    当前文件没有 Markdown 标题。
                  </div>
                )}
              </div>
            )}

            {panel === "listen" && (
              <div className="space-y-3">
                <div className={classNames("rounded-[16px] border p-4", theme.card)}>
                  <p className={classNames("text-xs font-semibold", theme.muted)}>朗读段落</p>
                  <p className={classNames("mt-2 line-clamp-4 text-sm leading-relaxed", theme.text)}>
                    {activePassage.text}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled
                    className={classNames("h-12 rounded-[14px] border text-sm font-semibold opacity-60", theme.card)}
                  >
                    朗读当前段
                  </button>
                  <button
                    type="button"
                    disabled
                    className={classNames("h-12 rounded-[14px] border text-sm font-semibold opacity-60", theme.card)}
                  >
                    连续听书
                  </button>
                </div>
                <div className={classNames("rounded-[14px] border px-4 py-3 text-sm leading-relaxed", theme.card, theme.muted)}>
                  VoxCPM2 接入后，这里会切换成播放控制条。
                </div>
              </div>
            )}

            {panel === "ask" && (
              <div className="space-y-3">
                <div className={classNames("rounded-[16px] border p-3", theme.card)}>
                  <p className={classNames("text-xs font-semibold", theme.muted)}>当前选中</p>
                  <p className={classNames("mt-2 line-clamp-3 text-sm leading-relaxed", theme.text)}>
                    {activePassage.text}
                  </p>
                </div>
                <label className={classNames("block rounded-[16px] border p-3", theme.card)}>
                  <span className="sr-only">输入问题</span>
                  <input
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void askCompanion("解释");
                    }}
                    className="w-full bg-transparent text-sm font-medium outline-none placeholder:text-current/35"
                    placeholder="问当前段落..."
                  />
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    ["解释", "解释一下"],
                    ["举例", "举个例子"],
                    ["质疑", "反过来质疑"],
                  ].map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => void askCompanion(mode as CompanionMode, label)}
                      disabled={asking}
                      className={classNames("h-11 rounded-[14px] border text-sm font-semibold disabled:opacity-60", theme.card)}
                    >
                      {label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => void askCompanion("解释")}
                    disabled={asking}
                    className="h-11 rounded-[14px] bg-[#1f8a70] text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {asking ? "..." : "发送"}
                  </button>
                </div>
                {companionAnswer && (
                  <div className={classNames("rounded-[16px] border p-4", theme.card)}>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <p className={classNames("text-sm font-semibold", theme.text)}>书伴回答</p>
                      <button
                        type="button"
                        onClick={saveAnswerAsNote}
                        className="rounded-full bg-[#1f8a70] px-3 py-1.5 text-xs font-semibold text-white"
                      >
                        保存
                      </button>
                    </div>
                    <p className={classNames("whitespace-pre-wrap text-[15px] leading-relaxed", theme.text)}>
                      {companionAnswer}
                    </p>
                  </div>
                )}
              </div>
            )}

            {panel === "dialogue" && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  {partners.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setPartner(item.id)}
                      className={classNames(
                        "min-h-[88px] rounded-[16px] border p-3 text-left transition",
                        theme.card,
                        partner === item.id && "border-[#1f8a70] shadow-[0_0_0_2px_rgba(31,138,112,0.16)]",
                      )}
                    >
                      <div className={classNames("text-[15px] font-semibold", theme.text)}>{item.name}</div>
                      <div className="mt-1 text-xs font-medium text-[#1f8a70]">{item.role}</div>
                      <div className={classNames("mt-2 text-xs leading-relaxed", theme.muted)}>{item.edge}</div>
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label className="space-y-1.5">
                    <span className={classNames("text-xs font-semibold uppercase tracking-[0.12em]", theme.muted)}>
                      时长
                    </span>
                    <select
                      value={length}
                      onChange={(event) => setLength(event.target.value)}
                      className={classNames("h-11 w-full rounded-[14px] border bg-transparent px-3 text-sm font-medium", theme.card)}
                    >
                      <option value="5">5 分钟</option>
                      <option value="10">10 分钟</option>
                      <option value="15">15 分钟</option>
                    </select>
                  </label>
                  <label className="space-y-1.5">
                    <span className={classNames("text-xs font-semibold uppercase tracking-[0.12em]", theme.muted)}>
                      深度
                    </span>
                    <select
                      value={depth}
                      onChange={(event) => setDepth(event.target.value)}
                      className={classNames("h-11 w-full rounded-[14px] border bg-transparent px-3 text-sm font-medium", theme.card)}
                    >
                      <option value="light">轻松</option>
                      <option value="deep">深入</option>
                      <option value="sharp">尖锐</option>
                    </select>
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() => void generateDialogue()}
                  disabled={generatingDialogue}
                  className="h-12 w-full rounded-[14px] bg-[#1f8a70] text-base font-semibold text-white disabled:opacity-70"
                >
                  {generatingDialogue ? "正在生成..." : "生成本章对谈"}
                </button>
                {dialogueTranscript && (
                  <div className={classNames("space-y-3 rounded-[16px] border p-4", theme.card)}>
                    <div className="flex items-center justify-between gap-3">
                      <p className={classNames("text-sm font-semibold", theme.text)}>
                        {selectedPartner.name} · {depthLabels[depth]}版
                      </p>
                      <button
                        type="button"
                        onClick={saveDialogueAsNote}
                        className="rounded-full bg-[#1f8a70] px-3 py-1.5 text-xs font-semibold text-white"
                      >
                        存为笔记
                      </button>
                    </div>
                    <div className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-[12px] bg-current/5 p-3 text-[14px] leading-relaxed">
                      {dialogueTranscript}
                    </div>
                  </div>
                )}
              </div>
            )}

            {panel === "notes" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className={classNames("text-lg font-semibold", theme.text)}>摘录和想法</h2>
                  <button
                    type="button"
                    onClick={saveSelectionAsNote}
                    className={classNames("rounded-full border px-3 py-1.5 text-sm font-medium", theme.card)}
                  >
                    记当前段
                  </button>
                </div>
                <div className="space-y-2">
                  {notes.map((note, index) => (
                    <button
                      key={`${note}-${index}`}
                      type="button"
                      className={classNames("block w-full rounded-[14px] border px-4 py-3 text-left text-sm leading-relaxed", theme.card)}
                    >
                      {note}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {panel === "settings" && (
              <div className="space-y-5">
                <div>
                  <p className={classNames("mb-2 text-xs font-semibold uppercase tracking-[0.12em]", theme.muted)}>
                    主题
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {(Object.keys(readerThemes) as ReaderThemeId[]).map((id) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setThemeId(id)}
                        className={classNames(
                          "h-12 rounded-[14px] border text-sm font-semibold",
                          readerThemes[id].card,
                          themeId === id && "border-[#1f8a70] shadow-[0_0_0_2px_rgba(31,138,112,0.16)]",
                        )}
                      >
                        {readerThemes[id].label}
                      </button>
                    ))}
                  </div>
                </div>
                {hasImportedText && (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={reflowImportedText}
                      className="h-11 rounded-[14px] bg-[#1f8a70] text-sm font-semibold text-white"
                    >
                      重新整理分段
                    </button>
                    <button
                      type="button"
                      onClick={clearImportedText}
                      className={classNames("h-11 rounded-[14px] border text-sm font-semibold", theme.card)}
                    >
                      清空导入文本
                    </button>
                  </div>
                )}
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className={classNames("text-xs font-semibold uppercase tracking-[0.12em]", theme.muted)}>
                      字号
                    </p>
                    <span className={classNames("text-sm", theme.muted)}>{fontSize}px</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setFontSize((value) => Math.max(16, value - 1))}
                      className={classNames("h-11 flex-1 rounded-[14px] border text-lg font-semibold", theme.card)}
                    >
                      A-
                    </button>
                    <button
                      type="button"
                      onClick={() => setFontSize((value) => Math.min(26, value + 1))}
                      className={classNames("h-11 flex-1 rounded-[14px] border text-lg font-semibold", theme.card)}
                    >
                      A+
                    </button>
                  </div>
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className={classNames("text-xs font-semibold uppercase tracking-[0.12em]", theme.muted)}>
                      行距
                    </p>
                    <span className={classNames("text-sm", theme.muted)}>{lineHeight.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="1.65"
                    max="2.35"
                    step="0.05"
                    value={lineHeight}
                    onChange={(event) => setLineHeight(Number(event.target.value))}
                    className="w-full accent-[#1f8a70]"
                  />
                </div>
              </div>
            )}
          </section>
        )}
      </section>
    </main>
  );
}
