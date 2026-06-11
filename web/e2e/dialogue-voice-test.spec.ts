/**
 * Two-voice dialogue narration: each line's TTS request carries the voice
 * mapped to its speaker; the playing line highlights; stop works.
 */
import { test, expect } from "@playwright/test";

const SCRIPT = [
  "许知远式：第一句，来自对话者。",
  "研究者：第二句，来自研究者。",
  "许知远式：第三句，又回到对话者。",
].join("\n");

test("dialogue plays with per-speaker voices", async ({ page }) => {
  test.setTimeout(90_000);

  await page.route("**/api/voices", (route) =>
    route.fulfill({
      json: { voices: [{ id: "v-a", label: "声音A" }, { id: "v-b", label: "声音B" }], default: null },
    }),
  );
  // dialogue route returns a fixed streaming script
  await page.route("**/api/book/dialogue", (route) =>
    route.fulfill({ status: 200, headers: { "Content-Type": "text/plain" }, body: SCRIPT }),
  );
  const ttsCalls: { text: string; voice?: string }[] = [];
  const pcm = Buffer.alloc(Math.floor(24000 * 0.3) * 2);
  await page.route("**/api/tts", (route) => {
    const body = route.request().postDataJSON() as { text: string; voice?: string };
    ttsCalls.push({ text: body.text, voice: body.voice });
    return route.fulfill({
      status: 200,
      headers: { "Content-Type": "application/octet-stream", "X-Sample-Rate": "24000" },
      body: pcm,
    });
  });

  await page.goto("http://localhost:3001/book", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("book-companion:jiyuan:text", "一段正文，用于对谈上下文。");
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  await page.locator("button:visible", { hasText: "问书" }).first().click();
  await page.waitForTimeout(400);
  await page.locator("button:visible", { hasText: "对谈" }).first().click();
  await page.waitForTimeout(300);
  await page.locator("button:visible", { hasText: "生成本章对谈" }).click();
  await expect(page.locator("[data-dlg-line='2']")).toBeVisible({ timeout: 10_000 });

  // map speakers to different voices: partner=A (default), researcher=B
  await page.locator("label", { hasText: "研究者的声音" }).locator("select").selectOption("v-b");
  await page.locator("button:visible", { hasText: "播放对谈" }).click();

  // line highlight appears
  await page.waitForSelector("[data-dlg-line].bg-\\[\\#1f8a70\\]\\/20, [data-dlg-line][class*='1f8a70']", { timeout: 10_000 });

  // wait for all 3 tts calls
  await expect.poll(() => ttsCalls.length, { timeout: 15_000 }).toBeGreaterThanOrEqual(3);
  console.log(`[dlg-voice] calls: ${JSON.stringify(ttsCalls.map((c) => ({ t: c.text.slice(0, 4), v: c.voice })))}`);

  expect(ttsCalls[0]).toMatchObject({ voice: "v-a" }); // 许知远式
  expect(ttsCalls[1]).toMatchObject({ voice: "v-b" }); // 研究者
  expect(ttsCalls[2]).toMatchObject({ voice: "v-a" }); // 许知远式
  console.log("[dlg-voice] per-speaker voice mapping OK");

  // stop clears the highlight and restores the play button
  const stopBtn = page.locator("button:visible", { hasText: "停止播放" });
  if (await stopBtn.count()) {
    await stopBtn.click();
  }
  await expect(page.locator("button:visible", { hasText: "播放对谈" })).toBeVisible({ timeout: 10_000 });
  console.log("[dlg-voice] stop OK");
});
