import { test, expect } from "@playwright/test";

const TEXT = Array.from({ length: 6 }, () =>
  "其实我对已知历史也没有特别强烈个人看法，基本相信这个世界来历的真实性，凡广为流传的过往都确曾发生过，差别只在叙事策略或史家个人局限上，这信念建立在不信人类有完全没影儿、无中生有能力基础上。"
).join("\n");

async function cur(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const m = document.querySelector("[data-page-indicator]")?.textContent?.match(/(\d+)\s*\/\s*(\d+)/);
    return m ? Number(m[1]) : 0;
  });
}

test("article padding area below text also flips pages", async ({ page }) => {
  await page.goto("http://localhost:3001/book", { waitUntil: "domcontentloaded" });
  await page.evaluate((t) => localStorage.setItem("book-companion:jiyuan:text", t), TEXT);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  // click inside the article's bottom padding strip (just above the fixed bar)
  const vp = page.viewportSize()!;
  expect(await cur(page)).toBe(1);
  await page.mouse.click(vp.width * 0.9, vp.height - 82);
  await page.waitForTimeout(400);
  expect(await cur(page)).toBe(2);
  console.log("[padclick] right side of bottom gap -> next page OK");

  await page.mouse.click(vp.width * 0.1, vp.height - 82);
  await page.waitForTimeout(400);
  expect(await cur(page)).toBe(1);
  console.log("[padclick] left side of bottom gap -> prev page OK");
});
