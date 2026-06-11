/**
 * REAL GPU smoke test: narration through the actual VoxCPM2 server.
 */
import { test, expect } from "@playwright/test";

const TEXT = ["你好，这是第一句测试。", "这是第二句，听书应该接着读。"].join("\n");

test("real GPU narration: two blocks, pipelined", async ({ page }) => {
  test.setTimeout(180_000);
  // skip when the voice server / tunnel is offline (GPU pod stopped)
  try {
    const health = await fetch("http://127.0.0.1:8001/health").then((r) => r.json());
    test.skip(!health.tts_loaded, "voice server not ready");
  } catch {
    test.skip(true, "voice server offline");
  }

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

  const t0 = Date.now();
  await page.locator("button:visible", { hasText: "连续听书" }).click();

  const seen: string[] = [];
  let firstAudioMs = 0;
  for (let i = 0; i < 600; i++) {
    const probe = await page.evaluate(() => ({
      speaking: document.querySelector(".speaking-block")?.textContent?.slice(0, 4) ?? "",
      phase: document.querySelector("[data-listen-phase]")?.getAttribute("data-listen-phase"),
    }));
    if (probe.speaking && !firstAudioMs) firstAudioMs = Date.now() - t0;
    if (probe.speaking && seen[seen.length - 1] !== probe.speaking) seen.push(probe.speaking);
    if (probe.phase === "idle" && seen.length) break;
    await page.waitForTimeout(150);
  }
  console.log(`[real] first audio after ${firstAudioMs}ms | sequence: ${seen.join(" -> ")} | total ${Date.now() - t0}ms`);
  expect(seen.length).toBeGreaterThanOrEqual(2);
});
