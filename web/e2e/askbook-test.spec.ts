/**
 * E2E for whole-book Q&A (问全书) via the Open Notebook gateway.
 * Requires: dev server :3001, Open Notebook :5055, OPENROUTER key.
 */
import { test, expect } from "@playwright/test";
import * as fs from "node:fs";

const TEXT = fs.readFileSync("/tmp/book-sample.txt", "utf8");

test("whole-book mode answers cross-chapter questions", async ({ page }) => {
  test.setTimeout(180_000);

  await page.goto("http://localhost:3001/book", { waitUntil: "domcontentloaded" });
  await page.evaluate((t) => localStorage.setItem("book-companion:jiyuan:text", t), TEXT);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  // open ask panel via bottom bar 问书
  await page.locator("button:visible", { hasText: "问书" }).first().click();
  await page.waitForTimeout(500);

  // switch to whole-book scope
  await page.locator("button:visible", { hasText: "问全书" }).first().click();
  await expect(page.locator("text=全书模式")).toBeVisible();

  // ask a question whose answer lives in chapter 1, not the current passage
  const input = page.locator('input[placeholder*="问当前段落"], input[placeholder*="继续追问"]').first();
  await input.fill("呼衍朵尼带了什么礼物来访？");
  await input.press("Enter");

  // wait for the answer (sync + LLM, can take a while)
  const thread = page.locator("[data-ask-thread]");
  await expect(thread).toContainText("呼衍朵尼带了什么礼物", { timeout: 10_000 });
  await expect(thread).toContainText("紫貂皮", { timeout: 120_000 });

  const answer = await thread.textContent();
  console.log("[askbook] answer contains 紫貂皮:", answer?.includes("紫貂皮"));
  await page.screenshot({ path: ".observe/askbook.png" });
});
