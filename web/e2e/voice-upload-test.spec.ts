/**
 * Private voice library: upload a recording -> voice extracted server-side ->
 * appears in the menu, gets selected, and is used by subsequent narration.
 */
import { test, expect } from "@playwright/test";

test("upload recording creates and selects a private voice", async ({ page }) => {
  test.setTimeout(60_000);

  let library = [{ id: "voice-a", label: "声音A" }];
  await page.route("**/api/voices", (route) =>
    route.fulfill({ json: { voices: library, default: null } }),
  );
  await page.route("**/api/voices/add", async (route) => {
    library = [...library, { id: "voice-mine", label: "我的录音" }];
    await route.fulfill({ json: { id: "voice-mine", label: "我的录音" } });
  });
  const requestedVoices: (string | undefined)[] = [];
  const pcm = Buffer.alloc(Math.floor(24000 * 0.3) * 2);
  await page.route("**/api/tts", (route) => {
    requestedVoices.push((route.request().postDataJSON() as { voice?: string }).voice);
    return route.fulfill({
      status: 200,
      headers: { "Content-Type": "application/octet-stream", "X-Sample-Rate": "24000" },
      body: pcm,
    });
  });

  await page.goto("http://localhost:3001/book", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("book-companion:jiyuan:text", "测试段落，用来朗读。");
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  await page.locator("button:visible", { hasText: "目录" }).first().click();
  await page.waitForTimeout(400);
  await page.locator("button:visible", { hasText: "听书" }).first().click();
  await page.waitForTimeout(300);

  // upload a fake wav
  await page.locator('input[type="file"][accept*="audio"]').setInputFiles({
    name: "我的录音.wav",
    mimeType: "audio/wav",
    buffer: Buffer.alloc(8000),
  });

  // new voice appears and is selected
  await expect(page.locator("[data-voice-upload-msg]")).toContainText("已添加并选用", { timeout: 10_000 });
  const mineBtn = page.locator("button:visible", { hasText: "我的录音" });
  await expect(mineBtn).toBeVisible();
  console.log("[upload] voice added and visible");

  // narration uses the new voice
  await page.locator("button:visible", { hasText: "朗读当前段" }).click();
  await expect.poll(() => requestedVoices.length, { timeout: 10_000 }).toBeGreaterThan(0);
  expect(requestedVoices[0]).toBe("voice-mine");
  console.log(`[upload] narration used voice: ${requestedVoices[0]}`);
});
