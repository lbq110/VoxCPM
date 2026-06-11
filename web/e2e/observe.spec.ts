/**
 * Observe + Verify utility for UI bug fixing loops.
 *
 * Injects sample Chinese text into localStorage so the reader renders blocks,
 * then screenshots + reads computed styles for diagnosis.
 *
 * Configure via environment variables:
 *   OBSERVE_URL        — page to open (default: http://localhost:3001/book)
 *   OBSERVE_SELECTOR   — CSS selector to inspect (default: reading blocks)
 *   OBSERVE_ACTION     — "screenshot" | "style" | "both" (default: "both")
 */

import { test } from "@playwright/test";
import * as path from "node:path";

const BASE_URL = process.env.OBSERVE_URL ?? "http://localhost:3001/book";
const SELECTOR = process.env.OBSERVE_SELECTOR ?? "[data-reading-block]";
const ACTION = process.env.OBSERVE_ACTION ?? "both";
const SCREENSHOT_DIR = path.join(__dirname, "../.observe");

// Real sentences from the user's book (起初·纪年) — mix of long comma-heavy
// sentences (forcing mid-sentence splits) and short complete paragraphs.
const PARAGRAPH_POOL = [
  "其实我对已知历史也没有特别强烈个人看法，基本相信这个世界来历的真实性，凡广为流传的过往都确曾发生过，差别只在叙事策略或史家个人局限上，这信念建立在不信人类有完全没影儿、无中生有能力基础上。",
  "人情世故，叫读书笔记、乱翻书偶得也成。",
  "选择汉武故事无他，只是碰巧对他这一朝几个人知道得更早，很小、不知汉武是谁前，就对“灌夫骂座”“金屋藏娇”这样的故事有印象，大概小时候家里有本前后汉故事集，至今书中灌夫揪人耳朵灌酒黑白插图尤在眼前，当然那本书已不知去向。",
  "觉得怎么都不像真名，严重影响了本来就日渐低下的虚构事实能力和本人一向秉持的对假定真实感的追求，几只小说因起不出理想人名迟迟不能开篇初心涣散终至放弃。",
  "于是想到取巧，找一个人名现成的故事，避开这个困扰。",
  "当然其中还有另一层偷懒，人名现成，故事谅必也现成，当时我还陷入另一种枯竭或称疲惫，即将日复一日流水般生活描绘为、或称伪装为不同寻常遭际的热情及自我增强力。",
  "有态度，没情节，就是这一等境地。于是很自然也是无可选择地把目光投向历史，就字面意思而言，历史就是故事。",
  "我先看的是明史，这也是巧合，本来还犹豫看哪段历史，正好那时我太太对明朝感兴趣，给我看了她做的笔记，我觉得那些事太有意思了。",
];
// Repeat the pool to generate 30+ pages of content (one paragraph per line,
// like a real book txt file). Each repetition starts with a bare chapter
// number line, matching the book's actual chapter format.
const SAMPLE_TEXT = Array.from(
  { length: 15 },
  (_, i) => `${i + 1}\n` + PARAGRAPH_POOL.join("\n"),
).join("\n");

async function injectTextAndWait(page: import("@playwright/test").Page) {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await page.evaluate((text) => {
    window.localStorage.setItem("book-companion:jiyuan:text", text);
  }, SAMPLE_TEXT);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
}

/** Read "current / total" from the header page indicator. */
async function pageInfo(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const el = document.querySelector("[data-page-indicator]");
    const m = el?.textContent?.match(/(\d+)\s*\/\s*(\d+)/);
    return m
      ? { current: Number(m[1]), total: Number(m[2]) }
      : { current: 1, total: 1 };
  });
}

/** Tap the right 30% zone of the reader to flip to the next page. */
async function tapNextPage(page: import("@playwright/test").Page) {
  const reader = page.locator("[data-reading-block]").first().locator("..").locator("..");
  const box = await reader.boundingBox();
  if (!box) throw new Error("reader not found for tap navigation");
  await page.mouse.click(box.x + box.width * 0.9, box.y + box.height * 0.5);
}

test("observe page state", async ({ page }) => {
  await injectTextAndWait(page);

  if (ACTION === "screenshot" || ACTION === "both") {
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "full-page.png"),
      fullPage: false,
    });
    console.log(`\n[observe] Full page screenshot saved to .observe/full-page.png`);

    const elements = page.locator(SELECTOR);
    const count = await elements.count();
    console.log(`[observe] Found ${count} elements matching "${SELECTOR}"`);

    for (let i = 0; i < Math.min(count, 3); i++) {
      const el = elements.nth(i);
      if (await el.isVisible()) {
        await el.screenshot({
          path: path.join(SCREENSHOT_DIR, `block-${i}.png`),
        });
        console.log(`[observe] Block ${i} screenshot saved to .observe/block-${i}.png`);
      }
    }
  }

  if (ACTION === "style" || ACTION === "both") {
    const rows = await page.evaluate((selector) => {
      const els = Array.from(document.querySelectorAll<HTMLElement>(selector)).filter(
        (el) => el.offsetParent !== null,
      );
      let prevBottom: number | null = null;
      return els.map((el, i) => {
        const cs = window.getComputedStyle(el);
        const r = el.getBoundingClientRect();
        const gapToPrev = prevBottom === null ? null : Math.round(r.top - prevBottom);
        prevBottom = r.bottom;
        return {
          i,
          text: el.textContent?.slice(0, 22) ?? "",
          textIndent: cs.textIndent,
          marginTop: cs.marginTop,
          marginBottom: cs.marginBottom,
          top: Math.round(r.top),
          bottom: Math.round(r.bottom),
          gapToPrev,
        };
      });
    }, SELECTOR);

    console.log(`\n[observe] === Visible Blocks: indent + gaps ===`);
    for (const row of rows) {
      console.log(
        `  [${row.i}] indent=${row.textIndent.padEnd(5)} mt=${row.marginTop.padEnd(5)} mb=${row.marginBottom.padEnd(5)} gapToPrev=${row.gapToPrev === null ? "  - " : String(row.gapToPrev).padStart(3) + "px"}  "${row.text}..."`,
      );
    }
  }
});

test("observe reading area + layout", async ({ page }) => {
  await injectTextAndWait(page);

  const diagnostics = await page.evaluate(() => {
    const results: Record<string, unknown> = {};

    const article = document.querySelector("article");
    if (article) {
      const cs = window.getComputedStyle(article);
      results.article = {
        display: cs.display,
        flexDirection: cs.flexDirection,
        height: cs.height,
        minHeight: cs.minHeight,
        overflow: cs.overflow,
        paddingBottom: cs.paddingBottom,
        rect: article.getBoundingClientRect(),
      };
    }

    const readerBlocks = document.querySelectorAll("[data-reading-block]");
    const visibleBlocks = Array.from(readerBlocks).filter(
      (el) => (el as HTMLElement).offsetParent !== null
    );
    const reader = visibleBlocks[0]?.parentElement;
    if (reader) {
      const cs = window.getComputedStyle(reader);
      const readerRect = reader.getBoundingClientRect();
      const paddingTop = parseFloat(cs.paddingTop) || 0;
      const paddingBottom = parseFloat(cs.paddingBottom) || 0;
      const contentTop = readerRect.top + paddingTop;
      const contentBottom = readerRect.bottom - paddingBottom;
      const contentHeight = contentBottom - contentTop;

      results.reader = {
        className: reader.className.slice(0, 80),
        boundingHeight: readerRect.height,
        paddingTop,
        paddingBottom,
        contentHeight,
        contentTop,
        contentBottom,
        overflow: cs.overflow,
        flex: cs.flex,
      };

      if (visibleBlocks.length > 0) {
        const lastBlock = visibleBlocks[visibleBlocks.length - 1] as HTMLElement;
        const lastRect = lastBlock.getBoundingClientRect();
        const lastStyle = window.getComputedStyle(lastBlock);
        const lastMarginBottom = parseFloat(lastStyle.marginBottom) || 0;
        const lastEffectiveBottom = lastRect.bottom + lastMarginBottom;

        results.lastBlock = {
          text: lastBlock.textContent?.slice(0, 40),
          rectBottom: lastRect.bottom,
          effectiveBottom: lastEffectiveBottom,
          overflow: lastEffectiveBottom - contentBottom,
          isClipped: lastEffectiveBottom > contentBottom,
        };

        results.allBlockBottoms = visibleBlocks.map((el, i) => {
          const r = el.getBoundingClientRect();
          return { i, bottom: Math.round(r.bottom), clipped: r.bottom > contentBottom };
        });
      }
    }

    const fixedBars = document.querySelectorAll('[class*="fixed"]');
    for (let i = 0; i < fixedBars.length; i++) {
      const bar = fixedBars[i] as HTMLElement;
      const cs = window.getComputedStyle(bar);
      if (cs.position === "fixed" && cs.bottom === "0px") {
        results.bottomBar = {
          tag: bar.tagName,
          height: cs.height,
          position: cs.position,
          rect: bar.getBoundingClientRect(),
        };
        break;
      }
    }

    results.viewport = { width: window.innerWidth, height: window.innerHeight };

    return results;
  });

  console.log("\n[observe] === Layout Diagnostics (page 1) ===");
  for (const [key, value] of Object.entries(diagnostics)) {
    console.log(`\n  ${key}:`, JSON.stringify(value, null, 4));
  }

  // Tap the right zone of the reader to flip forward (WeRead-style).
  const canFlip = await pageInfo(page).then(({ current, total }) => current < total);
  if (canFlip) {
    await tapNextPage(page);
    await page.waitForTimeout(800);

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "page2.png"),
      fullPage: false,
    });
    console.log("\n[observe] Page 2 screenshot saved to .observe/page2.png");

    const page2 = await page.evaluate(() => {
      const blocks = document.querySelectorAll("[data-reading-block]");
      const visible = Array.from(blocks).filter(
        (el) => (el as HTMLElement).offsetParent !== null
      );
      const reader = visible[0]?.parentElement;
      if (!reader || !visible.length) return null;

      const cs = window.getComputedStyle(reader);
      const readerRect = reader.getBoundingClientRect();
      const paddingBottom = parseFloat(cs.paddingBottom) || 0;
      const contentBottom = readerRect.bottom - paddingBottom;

      return {
        visibleBlockCount: visible.length,
        readerContentBottom: contentBottom,
        blocks: visible.map((el, i) => {
          const r = el.getBoundingClientRect();
          const s = window.getComputedStyle(el);
          const mb = parseFloat(s.marginBottom) || 0;
          return {
            i,
            text: el.textContent?.slice(0, 30),
            bottom: Math.round(r.bottom),
            effectiveBottom: Math.round(r.bottom + mb),
            overflow: Math.round(r.bottom + mb - contentBottom),
            clipped: r.bottom > contentBottom,
          };
        }),
      };
    });

    console.log("\n[observe] === Page 2 Block Positions ===");
    console.log(JSON.stringify(page2, null, 2));
  }
});

/**
 * Multi-page scan: walks through up to OBSERVE_PAGES pages (default 30) and
 * flags any block that violates the visual paragraph contract:
 *   - pseudo-paragraph: indent < 32px AND gapToPrev > 8px (looks like a new
 *     paragraph but has no indent)
 *   - clipped: block bottom exceeds the reader's visible content area
 */
const SCAN_PAGES = Number(process.env.OBSERVE_PAGES ?? 30);

test("scan pages for indent/gap/cutoff violations", async ({ page }) => {
  test.setTimeout(120_000);
  await injectTextAndWait(page);

  type Violation = {
    page: number;
    block: number;
    kind: string;
    indent: string;
    gapToPrev: number | null;
    overflowPx?: number;
    text: string;
  };
  const violations: Violation[] = [];

  for (let p = 0; p < SCAN_PAGES; p++) {
    // Column pagination: validate LINE boxes inside the current viewport.
    //  - clipped-line: a text line cut in half by the page edge
    //  - underfilled: a non-final page wasting more than 2 line-heights
    const data = await page.evaluate(() => {
      const firstBlock = document.querySelector<HTMLElement>("[data-reading-block]");
      const flow = firstBlock?.parentElement;
      const reader = flow?.parentElement;
      if (!flow || !reader) return null;

      const cs = window.getComputedStyle(reader);
      const rect = reader.getBoundingClientRect();
      const contentLeft = rect.left + (parseFloat(cs.paddingLeft) || 0);
      const contentRight = rect.right - (parseFloat(cs.paddingRight) || 0);
      const contentTop = rect.top + (parseFloat(cs.paddingTop) || 0);
      const contentBottom = rect.bottom - (parseFloat(cs.paddingBottom) || 0);

      const firstP = flow.querySelector("p");
      const lineHeightPx = firstP ? parseFloat(window.getComputedStyle(firstP).lineHeight) : 41;

      const walker = document.createTreeWalker(flow, NodeFilter.SHOW_TEXT);
      const lines: { top: number; bottom: number; text: string }[] = [];
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (!node.textContent?.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const r of Array.from(range.getClientRects())) {
          if (r.width < 2 || r.height < 2) continue;
          // keep only line boxes inside the current page viewport
          if (r.right <= contentLeft + 2 || r.left >= contentRight - 2) continue;
          lines.push({
            top: r.top,
            bottom: r.bottom,
            text: (node.textContent ?? "").slice(0, 16),
          });
        }
      }

      const maxBottom = lines.length ? Math.max(...lines.map((l) => l.bottom)) : contentTop;
      return { contentTop, contentBottom, lineHeightPx, lines, maxBottom };
    });

    if (!data) break;

    for (const line of data.lines) {
      const cutByBottom = line.top < data.contentBottom - 2 && line.bottom > data.contentBottom + 2;
      const cutByTop = line.top < data.contentTop - 2 && line.bottom > data.contentTop + 2;
      if (cutByBottom || cutByTop) {
        violations.push({
          page: p + 1, block: -1, kind: "clipped-line",
          indent: "-", gapToPrev: null,
          overflowPx: Math.round(line.bottom - data.contentBottom),
          text: line.text,
        });
      }
    }

    const waste = data.contentBottom - data.maxBottom;
    const info = await pageInfo(page);
    const isLastPage = info.current >= info.total;
    // An underfilled page is only a violation if the NEXT page does not start
    // with a chapter heading — chapter-final pages legitimately end short.
    const pendingUnderfill =
      !isLastPage && waste > data.lineHeightPx * 2
        ? {
            page: p + 1, block: -1, kind: "underfilled",
            indent: "-", gapToPrev: null,
            overflowPx: Math.round(waste),
            text: `page-bottom waste ${Math.round(waste)}px > ${Math.round(data.lineHeightPx * 2)}px`,
          }
        : null;

    const pageViolations = violations.filter((v) => v.page === p + 1);
    console.log(
      `[scan] page ${p + 1}: ${data.lines.length} lines, waste=${Math.round(data.contentBottom - data.maxBottom)}px, ${pageViolations.length} violations`,
    );
    if (pageViolations.length) {
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `violation-page-${p + 1}.png`),
      });
    }

    if (isLastPage) {
      console.log(`[scan] reached last page at ${p + 1}`);
      break;
    }
    await tapNextPage(page);
    await page.waitForTimeout(250);

    if (pendingUnderfill) {
      const nextStartsWithHeading = await page.evaluate(() => {
        const firstBlock = document.querySelector<HTMLElement>("[data-reading-block]");
        const flow = firstBlock?.parentElement;
        const reader = flow?.parentElement;
        if (!flow || !reader) return false;
        const cs = window.getComputedStyle(reader);
        const rect = reader.getBoundingClientRect();
        const contentLeft = rect.left + (parseFloat(cs.paddingLeft) || 0);
        const contentRight = rect.right - (parseFloat(cs.paddingRight) || 0);
        const inViewport = (r: DOMRect) =>
          r.width > 2 && r.height > 2 && r.right > contentLeft + 2 && r.left < contentRight - 2;

        const headingTops = Array.from(
          flow.querySelectorAll<HTMLElement>('[data-reading-block="heading"]'),
        )
          .map((el) => el.getBoundingClientRect())
          .filter(inViewport)
          .map((r) => r.top);
        if (!headingTops.length) return false;

        const walker = document.createTreeWalker(flow, NodeFilter.SHOW_TEXT);
        let minLineTop = Number.POSITIVE_INFINITY;
        while (walker.nextNode()) {
          const node = walker.currentNode;
          if (!node.textContent?.trim()) continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          for (const r of Array.from(range.getClientRects())) {
            if (!inViewport(r)) continue;
            if (r.top < minLineTop) minLineTop = r.top;
          }
        }
        return Math.min(...headingTops) <= minLineTop + 2;
      });
      if (!nextStartsWithHeading) violations.push(pendingUnderfill);
    }
  }

  console.log(`\n[scan] === RESULT: ${violations.length} violations ===`);
  if (violations.length) {
    console.log(JSON.stringify(violations, null, 2));
  }
});

/**
 * Chapter pagination: every level<=2 heading must sit at the top of its page —
 * no body text lines above it in the same page viewport.
 */
test("chapter headings start on a fresh page", async ({ page }) => {
  test.setTimeout(120_000);
  await injectTextAndWait(page);

  let headingsSeen = 0;
  const problems: { page: number; headingTop: number; minLineTop: number; text: string }[] = [];

  for (let p = 0; p < SCAN_PAGES; p++) {
    const check = await page.evaluate(() => {
      const firstBlock = document.querySelector<HTMLElement>("[data-reading-block]");
      const flow = firstBlock?.parentElement;
      const reader = flow?.parentElement;
      if (!flow || !reader) return null;

      const cs = window.getComputedStyle(reader);
      const rect = reader.getBoundingClientRect();
      const contentLeft = rect.left + (parseFloat(cs.paddingLeft) || 0);
      const contentRight = rect.right - (parseFloat(cs.paddingRight) || 0);

      const inViewport = (r: DOMRect) =>
        r.width > 2 && r.height > 2 && r.right > contentLeft + 2 && r.left < contentRight - 2;

      const headings = Array.from(
        flow.querySelectorAll<HTMLElement>('[data-reading-block="heading"]'),
      )
        .map((el) => ({ rect: el.getBoundingClientRect(), text: el.textContent ?? "" }))
        .filter((h) => inViewport(h.rect));

      const walker = document.createTreeWalker(flow, NodeFilter.SHOW_TEXT);
      let minLineTop = Number.POSITIVE_INFINITY;
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (!node.textContent?.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const r of Array.from(range.getClientRects())) {
          if (!inViewport(r)) continue;
          if (r.top < minLineTop) minLineTop = r.top;
        }
      }

      return {
        headings: headings.map((h) => ({ top: h.rect.top, text: h.text.slice(0, 10) })),
        minLineTop,
      };
    });

    if (!check) break;

    for (const h of check.headings) {
      headingsSeen += 1;
      // the heading must be the topmost content of its page
      if (h.top > check.minLineTop + 2) {
        problems.push({ page: p + 1, headingTop: h.top, minLineTop: check.minLineTop, text: h.text });
      }
    }

    const { current, total } = await pageInfo(page);
    if (current >= total) break;
    await tapNextPage(page);
    await page.waitForTimeout(250);
  }

  console.log(`\n[chapter] headings seen: ${headingsSeen}, misplaced: ${problems.length}`);
  if (problems.length) console.log(JSON.stringify(problems, null, 2));
  if (headingsSeen === 0) console.log("[chapter] WARNING: no headings encountered in scan range");
});
