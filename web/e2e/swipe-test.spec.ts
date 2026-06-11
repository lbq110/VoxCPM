/**
 * Swipe gestures: left swipe -> next page, right swipe -> prev page,
 * right swipe on page 1 -> stays (rubber band).
 */
import { test, expect } from "@playwright/test";

const POOL = [
  "其实我对已知历史也没有特别强烈个人看法，基本相信这个世界来历的真实性，凡广为流传的过往都确曾发生过，差别只在叙事策略或史家个人局限上。",
  "选择汉武故事无他，只是碰巧对他这一朝几个人知道得更早，就对“灌夫骂座”“金屋藏娇”这样的故事有印象。",
];
const TEXT = Array.from({ length: 10 }, () => POOL).flat().join("\n");

async function cur(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const m = document.querySelector("[data-page-indicator]")?.textContent?.match(/(\d+)\s*\/\s*(\d+)/);
    return m ? Number(m[1]) : 0;
  });
}

test("swipe left/right turns pages", async ({ page }) => {
  await page.goto("http://localhost:3001/book", { waitUntil: "domcontentloaded" });
  await page.evaluate((t) => {
    localStorage.clear();
    localStorage.setItem("book-companion:jiyuan:text", t);
  }, TEXT);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  const cdp = await page.context().newCDPSession(page);
  async function swipe(fromX: number, toX: number) {
    const y = 400;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: fromX, y }] });
    const steps = 8;
    for (let i = 1; i <= steps; i++) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: fromX + ((toX - fromX) * i) / steps, y }],
      });
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForTimeout(450);
  }

  expect(await cur(page)).toBe(1);

  await swipe(330, 80);   // swipe left -> next
  expect(await cur(page)).toBe(2);
  console.log("[swipe] left -> page 2 OK");

  await swipe(330, 80);
  expect(await cur(page)).toBe(3);

  await swipe(80, 330);   // swipe right -> prev
  expect(await cur(page)).toBe(2);
  console.log("[swipe] right -> page 2 OK");

  await swipe(80, 330);
  expect(await cur(page)).toBe(1);

  await swipe(80, 330);   // rubber band at first page
  expect(await cur(page)).toBe(1);
  console.log("[swipe] rubber band at page 1 OK");
});
