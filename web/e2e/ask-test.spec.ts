/**
 * E2E for the streaming multi-turn 问书 (ask-the-book) feature.
 * Makes REAL OpenRouter calls — requires OPENROUTER_API_KEY in .env.local
 * and the dev server on :3001.
 */
import { test, expect } from "@playwright/test";

const TEXT = [
  "阿老说中行老师说单于新立必入中国，这是我国习俗汉人也知道，一定高度戒备派出大量军队守候于边境要地，这时发兵收获可能不大。",
  "不如缓一闸，向汉国申请一老婆以示我国将继续奉行和亲、对汉友好政策，汉国上下必有所松懈。",
  "他们的军队都是临时召集，难以长期部署于边境，农忙会解散回家干活，到那时我军突入中国定收奇兵之效。",
].join("\n");

test("ask flow: select chunk -> ask -> streaming answer -> follow-up", async ({ page }) => {
  test.setTimeout(120_000);

  await page.goto("http://localhost:3001/book", { waitUntil: "domcontentloaded" });
  await page.evaluate((t) => localStorage.setItem("book-companion:jiyuan:text", t), TEXT);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  // 1. select a chunk (middle tap) -> toolbar -> 问书
  const span = page.locator('p[data-reading-block] span[role="button"]').first();
  const sbox = (await span.boundingBox())!;
  const reader = page.locator("[data-reading-block]").first().locator("..").locator("..");
  const rbox = (await reader.boundingBox())!;
  await page.mouse.click(rbox.x + rbox.width * 0.5, sbox.y + 10);
  await page.waitForTimeout(400);
  await page.locator("button:visible", { hasText: "问书" }).first().click();
  await page.waitForTimeout(600);

  // 2. type a question and send
  const input = page.locator('input[placeholder*="问当前段落"], input[placeholder*="继续追问"]').first();
  await input.fill("这段话里中行老师建议单于怎么做？");
  await input.press("Enter");

  // 3. user bubble appears immediately
  await expect(page.locator("[data-ask-thread]")).toContainText("中行老师建议", { timeout: 5_000 });

  // 4. streaming: assistant bubble grows between two samples
  const assistantBubble = page.locator("[data-ask-thread] > div").nth(1).locator("p");
  let earlyLen = 0;
  for (let i = 0; i < 40; i++) {
    const text = (await assistantBubble.textContent()) ?? "";
    if (text.trim() && text.trim() !== "…") {
      earlyLen = text.length;
      break;
    }
    await page.waitForTimeout(500);
  }
  expect(earlyLen).toBeGreaterThan(0);
  console.log(`[ask] streaming started, early length=${earlyLen}`);

  // wait for completion (send button back to 发送)
  await expect(page.locator("button", { hasText: "发送" })).toBeVisible({ timeout: 60_000 });
  const finalText = (await assistantBubble.textContent()) ?? "";
  console.log(`[ask] final answer (${finalText.length} chars): ${finalText.slice(0, 80)}...`);
  expect(finalText.length).toBeGreaterThanOrEqual(earlyLen);
  expect(finalText.length).toBeGreaterThan(20);

  await page.screenshot({ path: ".observe/ask-round1.png" });

  // 5. follow-up turn referencing the previous answer
  await input.fill("你刚才说的策略有什么风险？");
  await input.press("Enter");
  await page.waitForTimeout(1000);

  const bubbles = page.locator("[data-ask-thread] > div");
  await expect(bubbles).toHaveCount(4, { timeout: 10_000 });

  // wait for round 2 to finish
  for (let i = 0; i < 60; i++) {
    const sending = await page.locator("button", { hasText: "..." }).count();
    if (sending === 0) break;
    await page.waitForTimeout(1000);
  }
  const answer2 = (await bubbles.nth(3).locator("p").textContent()) ?? "";
  console.log(`[ask] follow-up answer (${answer2.length} chars): ${answer2.slice(0, 80)}...`);
  expect(answer2.length).toBeGreaterThan(20);

  await page.screenshot({ path: ".observe/ask-round2.png" });
});
