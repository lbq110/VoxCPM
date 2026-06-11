/**
 * Listening (read-aloud) flow with mocked /api/tts PCM. In headless Chromium
 * audio renders faster than real time, so we sample the highlight at high
 * frequency and assert on the SEQUENCE of narrated blocks.
 */
import { test, expect } from "@playwright/test";

const TEXT = [
  "第一段，这是要被朗读的第一句话，长度适中便于观察。",
  "第二段，朗读引擎应该自动接着读这一句。",
  "第三段，听书还在继续的话也会读到这里。",
].join("\n");

test("listen: narrates blocks in order, auto-stops, manual stop works", async ({ page }) => {
  test.setTimeout(90_000);

  const pcm = Buffer.alloc(Math.floor(24000 * 0.35) * 2);
  await page.route("**/api/tts", (route) =>
    route.fulfill({
      status: 200,
      headers: { "Content-Type": "application/octet-stream", "X-Sample-Rate": "24000" },
      body: pcm,
    }),
  );

  await page.goto("http://localhost:3001/book", { waitUntil: "domcontentloaded" });
  await page.evaluate((t) => {
    localStorage.clear();
    localStorage.setItem("book-companion:jiyuan:text", t);
  }, TEXT);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  // open the listen panel
  await page.locator("button:visible", { hasText: "目录" }).first().click();
  await page.waitForTimeout(400);
  await page.locator("button:visible", { hasText: "听书" }).first().click();
  await page.waitForTimeout(300);

  await page.locator("button:visible", { hasText: "连续听书" }).click();

  // sample the highlighted block until playback finishes
  const seen: string[] = [];
  for (let i = 0; i < 300; i++) {
    const probe = await page.evaluate(() => ({
      speaking: document.querySelector(".speaking-block")?.textContent?.slice(0, 3) ?? "",
      phase: document.querySelector("[data-listen-phase]")?.getAttribute("data-listen-phase"),
    }));
    if (probe.speaking && seen[seen.length - 1] !== probe.speaking) seen.push(probe.speaking);
    if (probe.phase === "idle" && seen.length) break;
    await page.waitForTimeout(40);
  }
  console.log(`[listen] narration sequence: ${seen.join(" -> ")}`);

  expect(seen[0]).toBe("第一段");
  expect(seen).toContain("第二段");
  expect(seen.indexOf("第一段")).toBeLessThan(seen.indexOf("第二段"));

  // finished: highlight cleared, phase idle
  expect(await page.locator(".speaking-block").count()).toBe(0);
  await expect(page.locator("[data-listen-phase]")).toHaveAttribute("data-listen-phase", "idle");
  console.log("[listen] auto-stop after last block OK");

  // manual stop midway
  await page.locator("button:visible", { hasText: "连续听书" }).click();
  await page.waitForSelector(".speaking-block", { timeout: 10_000 });
  await page.locator("button:visible", { hasText: "停止" }).click();
  await page.waitForTimeout(300);
  expect(await page.locator(".speaking-block").count()).toBe(0);
  await expect(page.locator("[data-listen-phase]")).toHaveAttribute("data-listen-phase", "idle");
  console.log("[listen] manual stop OK");
});

test("listen: auto page-turn follows narration across pages", async ({ page }) => {
  test.setTimeout(90_000);

  const pcm = Buffer.alloc(Math.floor(24000 * 0.2) * 2);
  await page.route("**/api/tts", (route) =>
    route.fulfill({
      status: 200,
      headers: { "Content-Type": "application/octet-stream", "X-Sample-Rate": "24000" },
      body: pcm,
    }),
  );

  const para =
    "其实我对已知历史也没有特别强烈个人看法，基本相信这个世界来历的真实性，凡广为流传的过往都确曾发生过，差别只在叙事策略或史家个人局限上。";
  await page.goto("http://localhost:3001/book", { waitUntil: "domcontentloaded" });
  await page.evaluate((t) => {
    localStorage.clear();
    localStorage.setItem("book-companion:jiyuan:text", t);
  }, Array.from({ length: 10 }, () => para).join("\n"));
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  await page.locator("button:visible", { hasText: "目录" }).first().click();
  await page.waitForTimeout(400);
  await page.locator("button:visible", { hasText: "听书" }).first().click();
  await page.waitForTimeout(300);
  await page.locator("button:visible", { hasText: "连续听书" }).click();

  let maxPage = 1;
  for (let i = 0; i < 400; i++) {
    const probe = await page.evaluate(() => {
      const m = document
        .querySelector("[data-page-indicator]")
        ?.textContent?.match(/(\d+)\s*\/\s*(\d+)/);
      return {
        page: m ? Number(m[1]) : 0,
        phase: document.querySelector("[data-listen-phase]")?.getAttribute("data-listen-phase"),
      };
    });
    maxPage = Math.max(maxPage, probe.page);
    if (probe.phase === "idle" && maxPage > 1) break;
    await page.waitForTimeout(40);
  }
  console.log(`[listen] narration reached page ${maxPage}`);
  expect(maxPage).toBeGreaterThan(1);
});
