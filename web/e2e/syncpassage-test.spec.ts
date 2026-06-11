/**
 * The active passage must follow the reading position: after flipping pages,
 * 问书's "当前选中" shows text from the page being read — not the book's
 * first block (the bug where it was stuck on "王朔").
 */
import { test, expect } from "@playwright/test";

const POOL = [
  "其实我对已知历史也没有特别强烈个人看法，基本相信这个世界来历的真实性，凡广为流传的过往都确曾发生过，差别只在叙事策略或史家个人局限上，这信念建立在不信人类有完全没影儿、无中生有能力基础上。",
  "选择汉武故事无他，只是碰巧对他这一朝几个人知道得更早，很小、不知汉武是谁前，就对“灌夫骂座”“金屋藏娇”这样的故事有印象，大概小时候家里有本前后汉故事集，至今书中灌夫揪人耳朵灌酒黑白插图尤在眼前。",
  "当然其中还有另一层偷懒，人名现成，故事谅必也现成，当时我还陷入另一种枯竭或称疲惫，即将日复一日流水般生活描绘为、或称伪装为不同寻常遭际的热情及自我增强力。",
  "我先看的是明史，这也是巧合，本来还犹豫看哪段历史，正好那时我太太对明朝感兴趣，给我看了她做的笔记，我觉得那些事太有意思了。",
];
const TEXT = ["王朔", ...Array.from({ length: 6 }, () => POOL).flat()].join("\n");

test("active passage follows page flips", async ({ page }) => {
  await page.goto("http://localhost:3001/book", { waitUntil: "domcontentloaded" });
  await page.evaluate((t) => localStorage.setItem("book-companion:jiyuan:text", t), TEXT);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  const reader = page.locator("[data-reading-block]").first().locator("..").locator("..");
  const box = (await reader.boundingBox())!;

  // flip forward two pages
  for (let i = 0; i < 2; i++) {
    await page.mouse.click(box.x + box.width * 0.9, box.y + box.height * 0.5);
    await page.waitForTimeout(400);
  }

  // visible text on the current page
  const pageText = await page.evaluate(() => {
    const flow = document.querySelector("[data-reading-block]")?.parentElement;
    const reader = flow?.parentElement;
    if (!flow || !reader) return "";
    const cs = getComputedStyle(reader);
    const rect = reader.getBoundingClientRect();
    const left = rect.left + parseFloat(cs.paddingLeft);
    const right = rect.right - parseFloat(cs.paddingRight);
    let text = "";
    const walker = document.createTreeWalker(flow, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const r of Array.from(range.getClientRects())) {
        if (r.width > 2 && r.right > left + 2 && r.left < right - 2) {
          text += node.textContent ?? "";
          break;
        }
      }
    }
    return text;
  });

  // open 问书
  await page.locator("button:visible", { hasText: "问书" }).first().click();
  await page.waitForTimeout(500);

  const selected = (await page
    .locator("text=当前选中")
    .locator("..")
    .locator("p")
    .nth(1)
    .textContent())!;
  console.log(`[sync] current passage: "${selected.slice(0, 30)}..."`);

  // must NOT be stuck on the book's first block
  expect(selected.startsWith("王朔")).toBe(false);
  expect(selected.startsWith("其实我对已知历史")).toBe(false);
  // must be text that's actually on the current page
  expect(pageText).toContain(selected.slice(0, 12));
});
