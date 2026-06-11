import { test, expect } from "@playwright/test";

const TEXT = Array.from({ length: 10 }, () =>
  "其实我对已知历史也没有特别强烈个人看法，基本相信这个世界来历的真实性，凡广为流传的过往都确曾发生过，差别只在叙事策略或史家个人局限上，这信念建立在不信人类有完全没影儿、无中生有能力基础上。"
).join("\n");

async function info(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const m = document.querySelector("[data-page-indicator]")?.textContent?.match(/(\d+)\s*\/\s*(\d+)/);
    return m ? { current: Number(m[1]), total: Number(m[2]) } : { current: 0, total: 0 };
  });
}

test("tap zones: right=next, left=prev, middle=select; no nav buttons", async ({ page }) => {
  await page.goto("http://localhost:3001/book", { waitUntil: "domcontentloaded" });
  await page.evaluate((t) => localStorage.setItem("book-companion:jiyuan:text", t), TEXT);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  const reader = page.locator("[data-reading-block]").first().locator("..").locator("..");
  const box = (await reader.boundingBox())!;
  const midY = box.y + box.height * 0.4;

  expect((await info(page)).current).toBe(1);

  await page.mouse.click(box.x + box.width * 0.9, midY);
  await page.waitForTimeout(400);
  expect((await info(page)).current).toBe(2);
  console.log("[tap] right zone -> page 2 OK");

  await page.mouse.click(box.x + box.width * 0.1, midY);
  await page.waitForTimeout(400);
  expect((await info(page)).current).toBe(1);
  console.log("[tap] left zone -> back to page 1 OK");

  const span = page.locator('p[data-reading-block] span[role="button"]').first();
  const sbox = (await span.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.5, sbox.y + 10);
  await page.waitForTimeout(400);
  expect((await info(page)).current).toBe(1);
  const toolbarCount = await page.locator("button:visible", { hasText: "划线" }).count();
  expect(toolbarCount).toBeGreaterThan(0);
  console.log("[tap] middle zone -> selection toolbar OK, no page flip");

  expect(await page.locator("button", { hasText: "下页" }).count()).toBe(0);
  expect(await page.locator("button", { hasText: "上页" }).count()).toBe(0);
  console.log("[tap] nav buttons removed OK");

  await page.screenshot({ path: ".observe/tapzone-final.png" });
});
