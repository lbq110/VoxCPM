/**
 * Narration voice must be selectable and FIXED: every /api/tts request
 * during continuous listening carries the same voice id.
 */
import { test, expect } from "@playwright/test";

const TEXT = ["第一段，测试音色固定。", "第二段，音色必须相同。", "第三段，仍然相同。"].join("\n");

test("fixed voice across narrated blocks", async ({ page }) => {
  test.setTimeout(90_000);

  const requestedVoices: (string | undefined)[] = [];
  const pcm = Buffer.alloc(Math.floor(24000 * 0.3) * 2);

  await page.route("**/api/voices", (route) =>
    route.fulfill({
      json: {
        voices: [
          { id: "voice-a", label: "声音A" },
          { id: "voice-b", label: "声音B" },
        ],
        default: null,
      },
    }),
  );
  await page.route("**/api/tts", (route) => {
    const body = route.request().postDataJSON() as { voice?: string };
    requestedVoices.push(body.voice);
    return route.fulfill({
      status: 200,
      headers: { "Content-Type": "application/octet-stream", "X-Sample-Rate": "24000" },
      body: pcm,
    });
  });

  await page.goto("http://localhost:3001/book", { waitUntil: "domcontentloaded" });
  await page.evaluate((t) => {
    localStorage.clear();
    localStorage.setItem("book-companion:jiyuan:text", t);
  }, TEXT);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  await page.locator("button:visible", { hasText: "目录" }).first().click();
  await page.waitForTimeout(400);
  await page.locator("button:visible", { hasText: "听书" }).first().click();
  await page.waitForTimeout(300);

  // pick voice B explicitly
  await page.locator("button:visible", { hasText: "声音B" }).click();
  await page.waitForTimeout(200);
  await page.locator("button:visible", { hasText: "连续听书" }).click();

  // wait until narration finishes
  for (let i = 0; i < 200; i++) {
    const phase = await page
      .locator("[data-listen-phase]")
      .getAttribute("data-listen-phase");
    if (phase === "idle" && requestedVoices.length >= 3) break;
    await page.waitForTimeout(50);
  }

  console.log(`[voice] tts requests carried voices: ${JSON.stringify(requestedVoices)}`);
  expect(requestedVoices.length).toBeGreaterThanOrEqual(3);
  for (const v of requestedVoices) expect(v).toBe("voice-b");

  // selection persists across reload
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("book-companion:jiyuan:state") ?? "{}"),
  );
  expect(saved.voiceId).toBe("voice-b");
  console.log("[voice] voiceId persisted OK");
});
