/**
 * Spoiler-safe RAG: asking about a character who only appeared in chapter 1
 * while reading a later page must produce a grounded answer (the detail can
 * ONLY come from retrieval — it's far outside the nearby-context window).
 */
import { test, expect } from "@playwright/test";

const FILLER = Array.from(
  { length: 30 },
  (_, i) =>
    `第${i + 2}段填充内容，这一段讲的是马厩翻建工程的种种琐事，与前文人物无关，工程进度缓慢，大家议论纷纷，总提将来要火，史曹们各有心思。`,
);
const TEXT = [
  "1",
  "起初，我六年，匈奴左骨都侯呼衍朵尼驮着紫貂皮、精炼羊奶酥酪和河磨玉来访，自上谷入境，王恢在红山口岸迎接。",
  "2",
  ...FILLER,
  "末段：当前阅读的位置，这里在讨论别的事情。",
].join("\n");

test("ask about chapter-1 character from a later page", async ({ page }) => {
  test.setTimeout(120_000);

  await page.goto("http://localhost:3001/book", { waitUntil: "domcontentloaded" });
  await page.evaluate((t) => localStorage.setItem("book-companion:jiyuan:text", t), TEXT);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  // jump to the LAST page via repeated taps (content is ~6-8 pages)
  const reader = page.locator("[data-reading-block]").first().locator("..").locator("..");
  const box = (await reader.boundingBox())!;
  for (let i = 0; i < 30; i++) {
    const info = await page.evaluate(() => {
      const m = document.querySelector("[data-page-indicator]")?.textContent?.match(/(\d+)\s*\/\s*(\d+)/);
      return m ? { c: Number(m[1]), t: Number(m[2]) } : { c: 1, t: 1 };
    });
    if (info.c >= info.t) break;
    await page.mouse.click(box.x + box.width * 0.9, box.y + box.height * 0.5);
    await page.waitForTimeout(250);
  }

  await page.locator("button:visible", { hasText: "问书" }).first().click();
  await page.waitForTimeout(500);

  const input = page.locator('input[placeholder*="问当前段落"], input[placeholder*="继续追问"]').first();
  await input.fill("呼衍朵尼是谁？他带了什么来？");
  await input.press("Enter");

  const thread = page.locator("[data-ask-thread]");
  // the answer must contain a chapter-1 detail that exists nowhere near the current page
  await expect(thread).toContainText(/紫貂皮|河磨玉|羊奶酥酪|左骨都侯/, { timeout: 90_000 });
  const answer = await thread.textContent();
  console.log(`[rag] answer: ${answer?.slice(-160)}`);
  await page.screenshot({ path: ".observe/rag-answer.png" });
});
