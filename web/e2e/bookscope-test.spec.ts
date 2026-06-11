/**
 * Whole-book mode (local RAG + streaming): reading page 1, ask about the
 * ENDING — only whole-book retrieval can ground this answer.
 */
import { test, expect } from "@playwright/test";

const FILLER = Array.from(
  { length: 25 },
  (_, i) => `第${i + 1}段填充，讲马厩翻建工程的琐事，进度缓慢，史曹们议论纷纷。`,
);
const TEXT = [
  "1",
  "起初，我六年，故事从这里开始。",
  ...FILLER,
  "9",
  "最终，呼衍朵尼带着紫貂皮和河磨玉返回匈奴，战事就此平息，全书在此落幕。",
].join("\n");

test("book scope answers questions about unread later chapters", async ({ page }) => {
  test.setTimeout(120_000);

  await page.goto("http://localhost:3001/book", { waitUntil: "domcontentloaded" });
  await page.evaluate((t) => {
    localStorage.clear();
    localStorage.setItem("book-companion:jiyuan:text", t);
  }, TEXT);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  // stay on page 1; open 问书 and switch to whole-book scope
  await page.locator("button:visible", { hasText: "问书" }).first().click();
  await page.waitForTimeout(500);
  await page.locator("button:visible", { hasText: "问全书" }).first().click();
  await page.waitForTimeout(200);

  const input = page.locator('input[placeholder*="问当前段落"], input[placeholder*="继续追问"]').first();
  await input.fill("书的结尾发生了什么？呼衍朵尼最后怎么样了？");
  await input.press("Enter");

  const thread = page.locator("[data-ask-thread]");
  // the answer must contain ending details that exist ONLY in the last chapter
  await expect(thread).toContainText(/紫貂皮|河磨玉|战事.{0,4}平息|返回匈奴/, { timeout: 90_000 });
  const answer = await thread.textContent();
  console.log(`[bookscope] answer tail: ${answer?.slice(-120)}`);
  await page.screenshot({ path: ".observe/bookscope.png" });
});
