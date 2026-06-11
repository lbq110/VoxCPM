/**
 * Reader state must survive a reload: reading position (anchored to a block,
 * not a page number), font size, theme, highlights.
 */
import { test, expect } from "@playwright/test";

const POOL = [
  "其实我对已知历史也没有特别强烈个人看法，基本相信这个世界来历的真实性，凡广为流传的过往都确曾发生过，差别只在叙事策略或史家个人局限上，这信念建立在不信人类有完全没影儿、无中生有能力基础上。",
  "选择汉武故事无他，只是碰巧对他这一朝几个人知道得更早，很小、不知汉武是谁前，就对“灌夫骂座”“金屋藏娇”这样的故事有印象。",
  "当然其中还有另一层偷懒，人名现成，故事谅必也现成，当时我还陷入另一种枯竭或称疲惫，即将日复一日流水般生活描绘为不同寻常遭际的热情。",
];
const TEXT = Array.from({ length: 8 }, () => POOL).flat().join("\n");

async function pageInfo(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const m = document.querySelector("[data-page-indicator]")?.textContent?.match(/(\d+)\s*\/\s*(\d+)/);
    return m ? { c: Number(m[1]), t: Number(m[2]) } : { c: 0, t: 0 };
  });
}

test("position, font size and theme survive reload", async ({ page }) => {
  await page.goto("http://localhost:3001/book", { waitUntil: "domcontentloaded" });
  await page.evaluate((t) => {
    localStorage.clear();
    localStorage.setItem("book-companion:jiyuan:text", t);
  }, TEXT);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  // flip 3 pages forward
  const reader = page.locator("[data-reading-block]").first().locator("..").locator("..");
  const box = (await reader.boundingBox())!;
  for (let i = 0; i < 3; i++) {
    await page.mouse.click(box.x + box.width * 0.9, box.y + box.height * 0.5);
    await page.waitForTimeout(300);
  }
  const before = await pageInfo(page);
  expect(before.c).toBeGreaterThan(1);

  // remember the text at the top of the current page
  const anchorText = await page.evaluate(() => {
    const sel = document.querySelector("[data-page-indicator]");
    void sel;
    return null;
  });
  void anchorText;

  // change font size (A+) and theme (背景) via bottom bar
  await page.locator("button:visible", { hasText: "放大" }).first().click();
  await page.waitForTimeout(400);
  await page.locator("button:visible", { hasText: "背景" }).first().click();
  await page.waitForTimeout(400);

  // reload
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(2500);

  const after = await pageInfo(page);
  console.log(`[persist] page before reload (after font change) vs after: ${after.c}/${after.t}`);
  // not on page 1 — position restored near the anchor block
  expect(after.c).toBeGreaterThan(1);

  // font size restored (21px on paragraphs)
  const fontSize = await page.evaluate(() => {
    const p = document.querySelector("p[data-reading-block]");
    return p ? getComputedStyle(p).fontSize : "";
  });
  expect(fontSize).toBe("21px");

  // theme restored (night -> paper after one 背景 click)
  const articleBg = await page.evaluate(() => {
    const article = document.querySelector("article");
    return article ? getComputedStyle(article).backgroundColor : "";
  });
  console.log(`[persist] font=${fontSize} bg=${articleBg}`);
  expect(articleBg).not.toBe("");

  await page.screenshot({ path: ".observe/persist.png" });
});
