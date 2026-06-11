"use client";

import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import {
  type BookBlock,
  firstSelectableId,
  parseBookText,
} from "@/lib/book-parser";
import { buildAskContext } from "@/lib/ask-context";
import { searchReadBlocks } from "@/lib/book-search";
import { parseReaderState, serializeReaderState } from "@/lib/reader-state";
import { VoicePlayer } from "@/lib/voicePlayer";

type DialoguePartner = {
  id: string;
  name: string;
  role: string;
  edge: string;
};

type Panel = "toc" | "listen" | "ask" | "dialogue" | "notes" | "settings";
type AskMessage = { role: "user" | "assistant"; content: string };
type CompanionMode = "解释" | "举例" | "质疑";
type ReaderThemeId = "paper" | "white" | "night";
type ReaderLayout = "mobile" | "desktop";

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

// Horizontal gap between pages (columns) in the line-level pagination flow.
const PAGE_GAP = 48;

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
    chrome: "border-[#ded8ca] bg-[#f7f5ee]/95 text-[#2f2d29]",
    bottom: "border-[#ded8ca] bg-[#f7f5ee]/96 text-[#2f2d29]",
    card: "border-[#dad3c4] bg-[#fbfaf4] text-[#2f2d29]",
    sheet: "border-[#d8d1c4] bg-[#fbfaf4] text-[#2f2d29]",
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
    chrome: "border-[#e1e4df] bg-[#fbfcfa]/95 text-[#252b29]",
    bottom: "border-[#e1e4df] bg-[#fbfcfa]/96 text-[#252b29]",
    card: "border-[#dfe4de] bg-white text-[#252b29]",
    sheet: "border-[#dde3dc] bg-[#fbfcfa] text-[#252b29]",
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
    chrome: "border-[#2b2a25] bg-[#1e1e1a]/95 text-[#d8d2c5]",
    bottom: "border-[#2b2a25] bg-[#1e1e1a]/96 text-[#d8d2c5]",
    card: "border-[#333126] bg-[#20201c] text-[#d8d2c5]",
    sheet: "border-[#333126] bg-[#20201c] text-[#d8d2c5]",
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
    ...(shouldIndentBlock(block) ? { textIndent: "2em" } : undefined),
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

export default function BookCompanion() {
  const mobileReaderRef = useRef<HTMLDivElement>(null);
  const mobileFlowRef = useRef<HTMLDivElement>(null);
  const [passages, setPassages] = useState(placeholderPassages);
  const [selectedPassage, setSelectedPassage] = useState(placeholderPassages[0].id);
  const [partner, setPartner] = useState(partners[0].id);
  const [length, setLength] = useState("10");
  const [depth, setDepth] = useState("sharp");
  const [panel, setPanel] = useState<Panel>("ask");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectionToolsOpen, setSelectionToolsOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [askMessages, setAskMessages] = useState<AskMessage[]>([]);
  const [askScope, setAskScope] = useState<"passage" | "book">("passage");
  const [bookSessionId, setBookSessionId] = useState<string | null>(null);
  const [bookSynced, setBookSynced] = useState(false);
  // Native text selection (long-press / drag) inside the reader. Takes
  // precedence over block-level selection as the 问书 target.
  const [nativeSelection, setNativeSelection] = useState<{ text: string; anchorId: string } | null>(
    null,
  );
  // Reading position waiting to be restored once pagination is measured.
  const [pendingAnchor, setPendingAnchor] = useState<string | null>(null);
  const restoredRef = useRef(false);
  // Horizontal swipe state. The drag follows the finger by mutating the flow
  // element's transform directly — going through React state would reconcile
  // the entire book on every touchmove and freeze large books.
  const swipeRef = useRef<{ startX: number; startY: number; active: boolean; dx: number } | null>(null);
  // Listening (read-aloud) engine state.
  const listenRef = useRef<{
    player: VoicePlayer | null;
    ids: string[];
    pos: number;
    active: boolean;
    paused: boolean;
    pendingAdvance: boolean;
    single: boolean;
  }>({ player: null, ids: [], pos: -1, active: false, paused: false, pendingAdvance: false, single: false });
  const [listenPhase, setListenPhase] = useState<"idle" | "synthesizing" | "speaking" | "paused">("idle");
  const [speakingBlockId, setSpeakingBlockId] = useState<string | null>(null);
  const [dialogueTranscript, setDialogueTranscript] = useState("");
  const [notes, setNotes] = useState(initialNotes);
  const [highlightedIds, setHighlightedIds] = useState<string[]>([]);
  const [importText, setImportText] = useState("");
  const [themeId, setThemeId] = useState<ReaderThemeId>("night");
  const [fontSize, setFontSize] = useState(20);
  const [lineHeight, setLineHeight] = useState(2.05);
  const [pageIndex, setPageIndex] = useState(0);
  const [activeLayout, setActiveLayout] = useState<ReaderLayout>("mobile");
  // Line-level pagination: the whole text flows through a CSS multi-column
  // container; each column is one page, shifted into view via translateX.
  const [flowSize, setFlowSize] = useState<{ w: number; h: number } | null>(null);
  const [mobilePageCount, setMobilePageCount] = useState(0);
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
  const desktopPages = useMemo(
    () => paginateBookBlocks(passages, fontSize, lineHeight, "desktop"),
    [fontSize, lineHeight, passages],
  );
  const mobileSafePageIndex = Math.min(pageIndex, Math.max(mobilePageCount - 1, 0));
  const desktopSafePageIndex = Math.min(pageIndex, Math.max(desktopPages.length - 1, 0));
  const currentDesktopPageBlocks =
    desktopPages[desktopSafePageIndex] ?? desktopPages[0] ?? placeholderPassages;
  const readableBlockCount = passages.filter((item) => item.kind !== "rule").length;
  const mobileReadingProgress = hasImportedText
    ? Math.max(1, Math.round(((mobileSafePageIndex + 1) / Math.max(mobilePageCount, 1)) * 100))
    : 0;
  const desktopReadingProgress = hasImportedText
    ? Math.max(1, Math.round(((desktopSafePageIndex + 1) / Math.max(desktopPages.length, 1)) * 100))
    : 0;
  const tocItems = useMemo(
    () => passages.filter((item) => item.kind === "heading" && item.text.trim()),
    [passages],
  );

  // The whole book renders into the column flow once; memoizing keeps page
  // turns and drawer state changes from reconciling thousands of blocks.
  const mobileReadingContent = useMemo(
    () => renderReadingBlocks(passages, "mobile", 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [passages, highlightedIds, themeId, fontSize, lineHeight, readingTitle],
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
      // Restore reader settings + reading position (anchor resolved to a
      // page index once pagination is ready).
      const state = parseReaderState(
        window.localStorage.getItem("book-companion:jiyuan:state"),
      );
      if (state) {
        setFontSize(state.fontSize);
        setLineHeight(state.lineHeight);
        setThemeId(state.themeId);
        if (state.notes.length) setNotes(state.notes);
        setHighlightedIds(state.highlightedIds);
        setAskMessages(state.askMessages);
        if (state.anchorBlockId) setPendingAnchor(state.anchorBlockId);
      }
      restoredRef.current = true;
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  // Resolve the saved anchor block to a page index once the flow is measured.
  useEffect(() => {
    if (!pendingAnchor || mobilePageCount <= 0) return;
    const frame = window.requestAnimationFrame(() => {
      const target = pageIndexForBlockId(pendingAnchor);
      setPageIndex(target);
      setSelectedPassage(pendingAnchor);
      setPendingAnchor(null);
    });
    return () => window.cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAnchor, mobilePageCount]);

  // Persist reader state on every meaningful change (after initial restore).
  useEffect(() => {
    if (!restoredRef.current) return;
    window.localStorage.setItem(
      "book-companion:jiyuan:state",
      serializeReaderState({
        anchorBlockId: selectedPassage === "placeholder" ? null : selectedPassage,
        fontSize,
        lineHeight,
        themeId,
        notes,
        highlightedIds,
        askMessages,
      }),
    );
  }, [selectedPassage, fontSize, lineHeight, themeId, notes, highlightedIds, askMessages]);

  // Rebind the listening phase handler every render so it always sees the
  // latest closures (passages, page state). Stop playback on unmount.
  useEffect(() => {
    const player = listenRef.current.player;
    if (player) player.onPhase = listenPhaseHandler;
  });
  useEffect(() => {
    const l = listenRef.current;
    return () => l.player?.stop();
  }, []);

  // Capture native text selections made inside the reader. The last
  // non-empty selection is kept even after the browser collapses it (tapping
  // a button clears the selection before the click handler runs).
  useEffect(() => {
    const onSelectionChange = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) return;
      const text = selection.toString().replace(/\s+/g, " ").trim();
      if (text.length < 4) return;
      const node = selection.anchorNode;
      const el = node instanceof Element ? node : node?.parentElement;
      const chunk = el?.closest?.("[data-chunk-id]") as HTMLElement | null;
      if (!chunk) return;
      setNativeSelection({ text, anchorId: chunk.dataset.chunkId ?? "" });
    };
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, []);

  // Track the reader viewport's content-box size (page width/height).
  useEffect(() => {
    const reader = mobileReaderRef.current;
    if (!reader) return;

    const measure = () => {
      const cs = window.getComputedStyle(reader);
      const w =
        reader.clientWidth -
        (Number.parseFloat(cs.paddingLeft) || 0) -
        (Number.parseFloat(cs.paddingRight) || 0);
      const h =
        reader.clientHeight -
        (Number.parseFloat(cs.paddingTop) || 0) -
        (Number.parseFloat(cs.paddingBottom) || 0);
      if (w > 0 && h > 0) {
        setFlowSize((current) =>
          current && current.w === w && current.h === h ? current : { w, h },
        );
      }
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(reader);
    return () => observer.disconnect();
  }, [hasImportedText]);

  // Recount pages whenever the flow re-renders (text/font/theme/size changes).
  useEffect(() => {
    if (!flowSize) return;
    let frame = 0;
    frame = window.requestAnimationFrame(() => {
      const flow = mobileFlowRef.current;
      if (!flow) return;
      const stride = flowSize.w + PAGE_GAP;
      const count = Math.max(1, Math.round((flow.scrollWidth + PAGE_GAP) / stride));
      setMobilePageCount(count);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [flowSize, fontSize, lineHeight, themeId, passages]);

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

  function pageCountForLayout(layout: ReaderLayout) {
    return layout === "mobile" ? mobilePageCount : desktopPages.length;
  }

  function goToPage(nextPageIndex: number, layout: ReaderLayout = activeLayout) {
    const count = Math.max(pageCountForLayout(layout), 1);
    const next = Math.min(Math.max(nextPageIndex, 0), count - 1);
    setActiveLayout(layout);
    setPageIndex(next);
    // Keep the "current passage" in sync with the reading position so 问书
    // always talks about what the reader is actually looking at.
    if (layout === "mobile") {
      const id = firstChunkIdOnPage(next);
      if (id) setSelectedPassage(id);
    }
    setNativeSelection(null);
    setSelectionToolsOpen(false);
    setDrawerOpen(false);
  }

  // In column pagination the page of a block is derived from its horizontal
  // position inside the flow container.
  function pageIndexForBlockId(blockId: string) {
    const flow = mobileFlowRef.current;
    if (!flow || !flowSize) return 0;
    const el = flow.querySelector<HTMLElement>(`[data-chunk-id="${CSS.escape(blockId)}"]`);
    if (!el) return 0;
    const delta = el.getBoundingClientRect().left - flow.getBoundingClientRect().left;
    return Math.max(0, Math.floor(delta / (flowSize.w + PAGE_GAP)));
  }

  // --- Swipe page-turning (WeRead-style drag + snap) ---
  function onReaderTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    swipeRef.current = { startX: t.clientX, startY: t.clientY, active: false, dx: 0 };
  }

  function flowBaseX() {
    return -(mobileSafePageIndex * ((flowSize?.w ?? 0) + PAGE_GAP));
  }

  function onReaderTouchMove(e: React.TouchEvent) {
    const s = swipeRef.current;
    const flow = mobileFlowRef.current;
    if (!s || !flow) return;
    const t = e.touches[0];
    const dx = t.clientX - s.startX;
    const dy = t.clientY - s.startY;
    if (!s.active) {
      // commit to a horizontal swipe only when clearly horizontal,
      // and never while the user is selecting text
      if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed) return;
      s.active = true;
    }
    const atStart = mobileSafePageIndex <= 0 && dx > 0;
    const atEnd = mobileSafePageIndex >= mobilePageCount - 1 && dx < 0;
    s.dx = atStart || atEnd ? dx * 0.35 : dx;
    flow.style.transform = `translateX(${flowBaseX() + s.dx}px)`;
  }

  function onReaderTouchEnd() {
    const s = swipeRef.current;
    const flow = mobileFlowRef.current;
    swipeRef.current = null;
    if (!s?.active || !flow) return;
    const threshold = Math.min(60, (flowSize?.w ?? 320) * 0.18);
    if (s.dx <= -threshold && mobileSafePageIndex < mobilePageCount - 1) {
      goToPage(mobileSafePageIndex + 1, "mobile");
    } else if (s.dx >= threshold && mobileSafePageIndex > 0) {
      goToPage(mobileSafePageIndex - 1, "mobile");
    } else {
      // snap back to the current page
      flow.style.transform = `translateX(${flowBaseX()}px)`;
    }
  }

  // --- Listening (read-aloud) engine ---
  // Highlight goes through the DOM directly: routing it through React state
  // would invalidate the memoized book content on every block change.
  function setSpeakingHighlight(id: string | null) {
    const flow = mobileFlowRef.current;
    if (!flow) return;
    flow.querySelectorAll(".speaking-block").forEach((el) => el.classList.remove("speaking-block"));
    if (id) {
      flow
        .querySelector(`[data-chunk-id="${CSS.escape(id)}"]`)
        ?.classList.add("speaking-block");
    }
  }

  function listenPhaseHandler(phase: "idle" | "synthesizing" | "speaking") {
    const l = listenRef.current;
    if (!l.active) {
      setListenPhase("idle");
      return;
    }
    if (phase === "idle") {
      // current block finished playing
      if (l.paused) {
        l.pendingAdvance = true;
        return;
      }
      advanceListening();
    } else {
      setListenPhase(phase);
    }
  }

  function ensurePlayer(): VoicePlayer {
    const l = listenRef.current;
    if (!l.player) {
      l.player = new VoicePlayer();
      l.player.onPhase = listenPhaseHandler;
    }
    return l.player;
  }

  function speakBlockAt(pos: number) {
    const l = listenRef.current;
    const id = l.ids[pos];
    const block = passages.find((b) => b.id === id);
    if (!block || !l.player) {
      stopListening();
      return;
    }
    l.pos = pos;
    setSpeakingBlockId(id);
    setSpeakingHighlight(id);
    // follow the narration without goToPage's side effects (it closes the
    // drawer, which holds the playback controls)
    setPageIndex(pageIndexForBlockId(id));
    setSelectedPassage(id);
    l.player.speak(block.text);
  }

  function advanceListening() {
    const l = listenRef.current;
    if (!l.active) return;
    const next = l.pos + 1;
    if (l.single || next >= l.ids.length) {
      stopListening();
      return;
    }
    speakBlockAt(next);
  }

  function startListening(single: boolean) {
    stopListening();
    const l = listenRef.current;
    const startId = nativeSelection?.anchorId ?? activePassage.id;
    const readable = passages.filter((b) => b.kind !== "rule" && b.text.trim());
    const startIndex = Math.max(0, readable.findIndex((b) => b.id === startId));
    l.ids = readable.slice(startIndex).map((b) => b.id);
    if (!l.ids.length) return;
    l.active = true;
    l.paused = false;
    l.pendingAdvance = false;
    l.single = single;
    const player = ensurePlayer();
    player.prime(); // must run inside the user gesture
    setListenPhase("synthesizing");
    speakBlockAt(0);
  }

  function pauseListening() {
    const l = listenRef.current;
    if (!l.active) return;
    l.paused = true;
    l.player?.pause();
    setListenPhase("paused");
  }

  function resumeListening() {
    const l = listenRef.current;
    if (!l.active) return;
    l.paused = false;
    l.player?.resume();
    setListenPhase("speaking");
    if (l.pendingAdvance) {
      l.pendingAdvance = false;
      advanceListening();
    }
  }

  function stopListening() {
    const l = listenRef.current;
    l.active = false;
    l.paused = false;
    l.pendingAdvance = false;
    l.ids = [];
    l.pos = -1;
    l.player?.stop();
    setSpeakingBlockId(null);
    setSpeakingHighlight(null);
    setListenPhase("idle");
  }

  /** First chunk whose start position lies on the given page. */
  function firstChunkIdOnPage(targetPage: number): string | null {
    const flow = mobileFlowRef.current;
    if (!flow || !flowSize) return null;
    const stride = flowSize.w + PAGE_GAP;
    const flowLeft = flow.getBoundingClientRect().left;
    let best: { id: string; left: number; top: number } | null = null;
    for (const el of Array.from(flow.querySelectorAll<HTMLElement>("[data-chunk-id]"))) {
      const rect = el.getBoundingClientRect();
      const left = rect.left - flowLeft;
      if (Math.floor((left + 2) / stride) !== targetPage) continue;
      if (!best || rect.top < best.top) {
        best = { id: el.dataset.chunkId ?? "", left, top: rect.top };
      }
    }
    return best?.id || null;
  }

  function selectBlock(block: BookBlock, layout: ReaderLayout = activeLayout) {
    if (block.kind === "rule") return;
    setActiveLayout(layout);
    setSelectedPassage(block.id);
    setNativeSelection(null);
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
    stopListening();
    setAskMessages([]);
    setBookSessionId(null);
    setBookSynced(false);
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
    stopListening();
    setAskMessages([]);
    setBookSessionId(null);
    setBookSynced(false);
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
    const text = (nativeSelection?.text ?? activePassage.text).trim();
    if (!text) return;
    setNotes((items) => [`摘录：${text.slice(0, 180)}${text.length > 180 ? "..." : ""}`, ...items]);
    openDrawer("notes");
  }

  async function askCompanion(mode: CompanionMode, nextQuestion = question) {
    const cleanQuestion = nextQuestion.trim();
    if (!cleanQuestion || asking) return;

    openDrawer("ask");
    setQuestion("");
    setAsking(true);
    setError("");

    const history = askMessages.slice(-8);
    setAskMessages((current) => [
      ...current,
      { role: "user", content: cleanQuestion },
      { role: "assistant", content: "" },
    ]);

    try {
      if (askScope === "book") {
        // Whole-book mode: Open Notebook gateway (multi-turn via its session)
        const raw = window.localStorage.getItem("book-companion:jiyuan:text") || "";
        const response = await fetch("/api/book/ask-book", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question: cleanQuestion,
            sessionId: bookSessionId ?? undefined,
            syncText: bookSynced ? undefined : raw,
          }),
        });
        const data = (await response.json().catch(() => ({}))) as {
          answer?: string;
          sessionId?: string;
          error?: string;
        };
        if (!response.ok) throw new Error(data.error || "全书问答失败");
        if (data.sessionId) setBookSessionId(data.sessionId);
        setBookSynced(true);
        const answer = data.answer?.trim() || "";
        if (!answer) throw new Error("全书问答为空，请重试");
        setAskMessages((current) => {
          const next = [...current];
          next[next.length - 1] = { role: "assistant", content: answer };
          return next;
        });
        return;
      }

      // Native text selection wins; otherwise the active block.
      const anchorId = nativeSelection?.anchorId ?? activePassage.id;
      const context = buildAskContext(passages, anchorId);
      const passageText = nativeSelection?.text || context.passage || activePassage.text;
      // Spoiler-safe RAG: retrieve relevant excerpts from already-read blocks
      // so questions about earlier chapters get grounded answers.
      const retrieved = searchReadBlocks(passages, anchorId, cleanQuestion, 5)
        .map((hit) => hit.text)
        .filter((text) => !context.before.includes(text) && text !== passageText);
      const response = await fetch("/api/book/companion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapterTitle: readingTitle,
          passage: passageText,
          before: context.before,
          retrieved,
          question: cleanQuestion,
          mode,
          notes,
          history,
        }),
      });
      if (!response.ok || !response.body) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "陪读回答生成失败");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let answer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        answer += decoder.decode(value, { stream: true });
        const snapshot = answer;
        setAskMessages((current) => {
          const next = [...current];
          next[next.length - 1] = { role: "assistant", content: snapshot };
          return next;
        });
      }
      if (!answer.trim()) throw new Error("陪读回答为空，请重试");
    } catch (err) {
      setError(err instanceof Error ? err.message : "陪读回答生成失败");
      // roll back the empty assistant bubble (keep the user's question visible)
      setAskMessages((current) =>
        current.length && current[current.length - 1].content === ""
          ? current.slice(0, -1)
          : current,
      );
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
    const lastAnswer = [...askMessages].reverse().find((m) => m.role === "assistant");
    const text = lastAnswer?.content.trim();
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
    // Group consecutive paragraph chunks of the same source paragraph so they
    // render inline inside one <p> — mid-sentence splits must not break lines.
    const groups: BookBlock[][] = [];
    blocks.forEach((passage, index) => {
      if (currentPageIndex === 0 && index === 0 && passage.kind === "heading" && passage.text === readingTitle) {
        return;
      }
      const lastGroup = groups[groups.length - 1];
      if (
        passage.kind === "paragraph" &&
        passage.continued &&
        lastGroup &&
        lastGroup[0].kind === "paragraph"
      ) {
        lastGroup.push(passage);
      } else {
        groups.push([passage]);
      }
    });

    return groups.map((group) => {
      const first = group[0];
      if (first.kind === "rule") {
        return <div key={first.id} className="mx-auto my-9 h-px w-24 bg-current/20" />;
      }
      if (first.kind !== "paragraph") {
        const highlighted = highlightedIds.includes(first.id);
        return (
          <div
            key={first.id}
            data-reading-block={first.kind}
            data-chunk-id={first.id}
            role="button"
            tabIndex={0}
            onClick={() => selectBlock(first, layout)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") selectBlock(first, layout); }}
            style={readingBlockStyle(first, fontSize, lineHeight)}
            className={classNames(
              "cursor-pointer mt-3 break-inside-avoid",
              // Major chapters always start on a fresh page (column).
              first.kind === "heading" && (first.level ?? 1) <= 2 && "break-before-column",
              readingBlockClass(first, highlighted, theme),
            )}
          >
            {first.kind === "list" && (
              <span className="mr-2 font-semibold text-[#1f8a70]">•</span>
            )}
            <span>{first.text}</span>
          </div>
        );
      }
      // No break-inside-avoid: paragraphs must flow across page (column)
      // boundaries line by line, like a real book.
      return (
        <p
          key={first.id}
          data-reading-block="paragraph"
          style={{
            fontSize: `${fontSize}px`,
            lineHeight,
            // Allow single lines at page boundaries (like WeRead) so pages
            // fill completely instead of pushing whole paragraphs over.
            orphans: 1,
            widows: 1,
            ...(first.continued ? undefined : { textIndent: "2em" }),
          }}
          className={classNames(
            first.continued ? "mt-0" : "mt-3",
            "px-1.5 py-1 text-left tracking-[0.01em]",
            theme.text,
          )}
        >
          {group.map((chunk) => {
            const highlighted = highlightedIds.includes(chunk.id);
            return (
              <span
                key={chunk.id}
                data-chunk-id={chunk.id}
                role="button"
                tabIndex={0}
                onClick={() => selectBlock(chunk, layout)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") selectBlock(chunk, layout); }}
                className={classNames(
                  "cursor-pointer rounded-[4px] box-decoration-clone transition",
                  highlighted && "bg-[#f4df8c]/35",
                )}
              >
                {chunk.text}
              </span>
            );
          })}
        </p>
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
          onClick={(e) => {
            // Taps landing on the article's own padding (below the reader)
            // page-flip too — same zones as the reader itself.
            if (e.target !== e.currentTarget || !hasImportedText) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const ratio = (e.clientX - rect.left) / rect.width;
            if (ratio < 0.3) goToPage(mobileSafePageIndex - 1, "mobile");
            else if (ratio > 0.7) goToPage(mobileSafePageIndex + 1, "mobile");
          }}
          className={classNames(
            "relative flex min-h-[100dvh] flex-col overflow-hidden px-6 pb-[88px] md:min-h-[calc(100vh-64px)] md:rounded-[32px] md:shadow-2xl md:shadow-black/40",
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
              className={classNames("grid h-10 w-10 place-items-center rounded-full text-xl", theme.text, theme.hover)}
              aria-label="目录"
            >
              ☰
            </button>
            <div className="min-w-0 px-2 text-center">
              <div className={classNames("truncate text-[16px] font-semibold", theme.text)}>
                {readingTitle}
              </div>
              <div data-page-indicator className={classNames("mt-0.5 text-[11px]", theme.muted)}>
                {hasImportedText
                  ? `${mobileSafePageIndex + 1} / ${mobilePageCount} · ${mobileReadingProgress}%`
                  : bookSubtitle}
              </div>
            </div>
            <button
              type="button"
              onClick={() => openDrawer("settings", "mobile")}
              className={classNames("grid h-10 w-10 place-items-center rounded-full text-[17px] font-semibold", theme.text, theme.hover)}
              aria-label="设置"
            >
              A
            </button>
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
                {hasImportedText ? `${readableBlockCount} 个阅读块 · ${mobilePageCount} 页` : "等待导入正文"}
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
              onTouchStart={onReaderTouchStart}
              onTouchMove={onReaderTouchMove}
              onTouchEnd={onReaderTouchEnd}
              onTouchCancel={onReaderTouchEnd}
              style={{ touchAction: "pan-y" }}
              onClickCapture={(e) => {
                // WeRead-style tap zones: left 30% = prev page, right 30% =
                // next page. Capture phase stops the tap from reaching chunk
                // spans; the middle 40% falls through to text selection.
                const rect = e.currentTarget.getBoundingClientRect();
                const ratio = (e.clientX - rect.left) / rect.width;
                if (ratio < 0.3) {
                  e.stopPropagation();
                  goToPage(mobileSafePageIndex - 1, "mobile");
                } else if (ratio > 0.7) {
                  e.stopPropagation();
                  goToPage(mobileSafePageIndex + 1, "mobile");
                }
              }}
              className={classNames(
                "mt-4 min-h-0 flex-1 overflow-hidden px-1 pb-4 transition-opacity duration-150",
                mobilePageCount > 0 ? "opacity-100" : "opacity-0",
              )}
            >
              {flowSize && (
                <div
                  ref={mobileFlowRef}
                  style={{
                    height: flowSize.h,
                    columnWidth: flowSize.w,
                    columnGap: PAGE_GAP,
                    columnFill: "auto",
                    // No transition: the multi-column canvas is far wider than
                    // the GPU texture limit, so it can't be composited — an
                    // animated transform repaints it on the main thread every
                    // frame and freezes large books. Instant flip = one paint.
                    transform: `translateX(${-(mobileSafePageIndex * (flowSize.w + PAGE_GAP))}px)`,
                  }}
                >
                  {mobileReadingContent}
                </div>
              )}
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
                  ["问书", () => openDrawer("ask")],
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
                ["问书", () => openDrawer("ask")],
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
                        panel === id ? "bg-[#1f8a70] text-white shadow-sm" : "opacity-65",
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
                        setPageIndex(pageIndexForBlockId(item.id));
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
                  <p className={classNames("text-xs font-semibold", theme.muted)}>
                    {listenPhase === "idle" ? "从此处开始" : "正在朗读"}
                  </p>
                  <p
                    data-listen-current
                    className={classNames("mt-2 line-clamp-4 text-sm leading-relaxed", theme.text)}
                  >
                    {(speakingBlockId && passages.find((b) => b.id === speakingBlockId)?.text) ||
                      nativeSelection?.text ||
                      activePassage.text}
                  </p>
                </div>
                {listenPhase === "idle" ? (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => startListening(true)}
                      className={classNames("h-12 rounded-[14px] border text-sm font-semibold", theme.card, theme.hover)}
                    >
                      朗读当前段
                    </button>
                    <button
                      type="button"
                      onClick={() => startListening(false)}
                      className="h-12 rounded-[14px] bg-[#1f8a70] text-sm font-semibold text-white"
                    >
                      连续听书
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {listenPhase === "paused" ? (
                      <button
                        type="button"
                        onClick={resumeListening}
                        className="h-12 rounded-[14px] bg-[#1f8a70] text-sm font-semibold text-white"
                      >
                        继续
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={pauseListening}
                        className={classNames("h-12 rounded-[14px] border text-sm font-semibold", theme.card, theme.hover)}
                      >
                        暂停
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={stopListening}
                      className={classNames("h-12 rounded-[14px] border text-sm font-semibold", theme.card, theme.hover)}
                    >
                      停止
                    </button>
                  </div>
                )}
                <div
                  data-listen-phase={listenPhase}
                  className={classNames("rounded-[14px] border px-4 py-3 text-sm leading-relaxed", theme.card, theme.muted)}
                >
                  {listenPhase === "idle" && "点击按钮开始朗读。连续听书会自动翻页续读。"}
                  {listenPhase === "synthesizing" && "正在合成语音..."}
                  {listenPhase === "speaking" && "朗读中，正文里高亮的就是当前句。"}
                  {listenPhase === "paused" && "已暂停。"}
                </div>
              </div>
            )}

            {panel === "ask" && (
              <div className="space-y-3">
                <div className={classNames("flex gap-1 rounded-full bg-current/10 p-1 text-sm font-medium", theme.text)}>
                  {([
                    ["passage", "问段落"],
                    ["book", "问全书"],
                  ] as const).map(([scope, label]) => (
                    <button
                      key={scope}
                      type="button"
                      onClick={() => setAskScope(scope)}
                      className={classNames(
                        "flex-1 rounded-full px-3 py-2 transition",
                        askScope === scope ? "bg-[#1f8a70] text-white shadow-sm" : "opacity-65",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className={classNames("rounded-[16px] border p-3", theme.card)}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      {askScope === "passage" ? (
                        <>
                          <p className={classNames("text-xs font-semibold", theme.muted)}>
                            {nativeSelection ? "已选文字" : "当前选中"}
                          </p>
                          <p className={classNames("mt-2 line-clamp-3 text-sm leading-relaxed", theme.text)}>
                            {nativeSelection?.text ?? activePassage.text}
                          </p>
                        </>
                      ) : (
                        <p className={classNames("text-xs leading-relaxed", theme.muted)}>
                          全书模式：基于整本书内容回答，可以问跨章节的问题。首次提问会同步书稿，稍慢。
                        </p>
                      )}
                    </div>
                    {askMessages.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setAskMessages([]);
                          setBookSessionId(null);
                        }}
                        className={classNames("shrink-0 rounded-full border border-current/15 px-2.5 py-1 text-xs", theme.muted, theme.hover)}
                      >
                        清空对话
                      </button>
                    )}
                  </div>
                </div>

                {askMessages.length > 0 && (
                  <div data-ask-thread className="space-y-2">
                    {askMessages.map((message, index) => (
                      <div
                        key={index}
                        className={classNames("flex", message.role === "user" ? "justify-end" : "justify-start")}
                      >
                        {message.role === "user" ? (
                          <p className="max-w-[85%] rounded-[16px] rounded-br-[4px] bg-[#1f8a70] px-3.5 py-2.5 text-sm leading-relaxed text-white">
                            {message.content}
                          </p>
                        ) : (
                          <div className={classNames("max-w-[92%] rounded-[16px] rounded-bl-[4px] border px-3.5 py-2.5", theme.card)}>
                            <p className={classNames("whitespace-pre-wrap text-[15px] leading-relaxed", theme.text)}>
                              {message.content || "…"}
                            </p>
                            {!asking && index === askMessages.length - 1 && message.content && (
                              <button
                                type="button"
                                onClick={saveAnswerAsNote}
                                className="mt-2 rounded-full bg-[#1f8a70] px-3 py-1 text-xs font-semibold text-white"
                              >
                                保存为笔记
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <label className={classNames("block rounded-[16px] border p-3", theme.card)}>
                  <span className="sr-only">输入问题</span>
                  <input
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void askCompanion("解释");
                    }}
                    className="w-full bg-transparent text-sm font-medium outline-none placeholder:text-current/35"
                    placeholder={askMessages.length ? "继续追问..." : "问当前段落..."}
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
