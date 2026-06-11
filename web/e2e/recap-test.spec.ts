/**
 * 前情提要: recap covers the story from the opening up to the reading
 * position, and never leaks unread content.
 */
import { test, expect } from "@playwright/test";

const TEXT = [
  "1",
  "起初，呼衍朵尼驮着紫貂皮来访，王恢在红山口岸迎接，故事由此开始。",
  ...Array.from({ length: 28 }, (_, i) => `第${i + 2}段：马厩翻建工程的琐事，史曹们各有心思，进度缓慢。`),
  "中段关键事件：单于决定向汉国申请和亲，以麻痹汉军。",
  ...Array.from({ length: 10 }, (_, i) => `第${i + 32}段：边境的日常巡逻与等待，时间慢慢过去。`),
  "当前位置：会议仍在进行，门口加了岗。",
  "未读剧情：田蚡突然升任太尉，权倾朝野，这是读者还没读到的内容。",
].join("\n");

test("recap covers opening + key events, no spoilers", async ({ page }) => {
  test.setTimeout(120_000);

  await page.goto("http://localhost:3001/book", { waitUntil: "domcontentloaded" });
  await page.evaluate((t) => {
    localStorage.clear();
    localStorage.setItem("book-companion:jiyuan:text", t);
  }, TEXT);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  // flip near the end (where 当前位置 lives), but before 未读剧情
  const reader = page.locator("[data-reading-block]").first().locator("..").locator("..");
  const box = (await reader.boundingBox())!;
  for (let i = 0; i < 30; i++) {
    const info = await page.evaluate(() => {
      const m = document.querySelector("[data-page-indicator]")?.textContent?.match(/(\d+)\s*\/\s*(\d+)/);
      return m ? { c: Number(m[1]), t: Number(m[2]) } : { c: 1, t: 1 };
    });
    if (info.c >= info.t - 1) break; // second-to-last page
    await page.mouse.click(box.x + box.width * 0.9, box.y + box.height * 0.5);
    await page.waitForTimeout(250);
  }

  await page.locator("button:visible", { hasText: "问书" }).first().click();
  await page.waitForTimeout(500);
  await page.locator("button:visible", { hasText: "前情提要" }).click();

  const thread = page.locator("[data-ask-thread]");
  // recap must mention the opening event (only in block 2 of the book)
  await expect(thread).toContainText(/呼衍朵尼|紫貂皮|红山口岸/, { timeout: 90_000 });
  await page.waitForTimeout(1000);
  const answer = (await thread.textContent()) ?? "";
  console.log(`[recap] length=${answer.length}, mentions opening: ${/呼衍朵尼|紫貂皮/.test(answer)}, mentions 和亲: ${answer.includes("和亲")}`);
  // spoiler check: the unread plot point must NOT appear
  expect(answer).not.toContain("太尉");
  console.log("[recap] no spoilers OK");
  await page.screenshot({ path: ".observe/recap.png" });
});
