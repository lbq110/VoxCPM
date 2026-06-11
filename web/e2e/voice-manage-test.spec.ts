/**
 * Voice management (rename/delete) + one-tap narration from the bottom bar.
 */
import { test, expect } from "@playwright/test";

test("bottom-bar narration toggle: play -> pause -> resume", async ({ page }) => {
  test.setTimeout(60_000);
  const pcm = Buffer.alloc(Math.floor(24000 * 3) * 2); // 3s so it stays playing
  await page.route("**/api/tts", (route) =>
    route.fulfill({
      status: 200,
      headers: { "Content-Type": "application/octet-stream", "X-Sample-Rate": "24000" },
      body: pcm,
    }),
  );
  await page.goto("http://localhost:3001/book", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem(
      "book-companion:jiyuan:text",
      Array.from({ length: 6 }, (_, i) => `第${i + 1}段，足够长的内容用来持续朗读。`).join("\n"),
    );
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  // one tap from the page — no drawer digging
  await page.locator('[data-bar-action="朗读"]:visible').click();
  await expect(page.locator('[data-bar-action="暂停"]:visible')).toBeVisible({ timeout: 10_000 });
  console.log("[bar] play -> playing (暂停 shown)");

  await page.locator('[data-bar-action="暂停"]:visible').click();
  await expect(page.locator('[data-bar-action="继续"]:visible')).toBeVisible({ timeout: 5_000 });
  console.log("[bar] pause -> paused (继续 shown)");

  await page.locator('[data-bar-action="继续"]:visible').click();
  await expect(page.locator('[data-bar-action="暂停"]:visible')).toBeVisible({ timeout: 5_000 });
  console.log("[bar] resume OK");
});

test("rename and delete voices from the listen panel", async ({ page }) => {
  test.setTimeout(60_000);
  let library = [
    { id: "v1", label: "音色一" },
    { id: "v2", label: "音色二" },
  ];
  await page.route("**/api/voices", (route) =>
    route.fulfill({ json: { voices: library, default: null } }),
  );
  await page.route("**/api/voices/manage", async (route) => {
    const body = route.request().postDataJSON() as { action: string; id: string; label?: string };
    if (body.action === "rename") {
      library = library.map((v) => (v.id === body.id ? { ...v, label: body.label! } : v));
    } else {
      library = library.filter((v) => v.id !== body.id);
    }
    await route.fulfill({ json: { ok: true } });
  });

  await page.goto("http://localhost:3001/book", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("book-companion:jiyuan:text", "一段正文。");
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  await page.locator("button:visible", { hasText: "目录" }).first().click();
  await page.waitForTimeout(400);
  await page.locator("button:visible", { hasText: "听书" }).first().click();
  await page.waitForTimeout(300);

  // enter manage mode
  await page.locator("button:visible", { hasText: "管理" }).click();

  // rename v1 via prompt dialog
  page.once("dialog", (d) => d.accept("新名字"));
  await page.locator('button[aria-label="重命名 音色一"]').click();
  await expect(page.locator("button:visible", { hasText: "新名字" })).toBeVisible({ timeout: 5_000 });
  console.log("[manage] rename OK");

  // delete v2 via confirm dialog
  page.once("dialog", (d) => d.accept());
  await page.locator('button[aria-label="删除 音色二"]').click();
  await expect(page.locator("button:visible", { hasText: "音色二" })).toHaveCount(0, { timeout: 5_000 });
  console.log("[manage] delete OK");
});

test("pause survives a synthesis completing in the background", async ({ page }) => {
  test.setTimeout(60_000);
  const pcm = Buffer.alloc(Math.floor(24000 * 2) * 2);
  await page.route("**/api/tts", async (route) => {
    // synthesis takes a while — completes AFTER the user paused
    await new Promise((r) => setTimeout(r, 1200));
    await route.fulfill({
      status: 200,
      headers: { "Content-Type": "application/octet-stream", "X-Sample-Rate": "24000" },
      body: pcm,
    });
  });
  await page.goto("http://localhost:3001/book", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem(
      "book-companion:jiyuan:text",
      Array.from({ length: 5 }, (_, i) => `第${i + 1}段内容，比较长的句子方便测试。`).join("\n"),
    );
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  await page.locator('[data-bar-action="朗读"]:visible').click();
  await page.waitForTimeout(300); // synthesis of block 1 still in flight
  // pause while synthesizing
  await page.locator('[data-bar-action="暂停"]:visible').click();
  await expect(page.locator('[data-bar-action="继续"]:visible')).toBeVisible({ timeout: 3_000 });

  // background synthesis completes now — paused state must SURVIVE
  await page.waitForTimeout(2500);
  await expect(page.locator('[data-bar-action="继续"]:visible')).toBeVisible();
  const phase = await page.locator("[data-listen-phase]").count();
  void phase;
  console.log("[pause-race] paused state survived background synthesis");

  // resume still works
  await page.locator('[data-bar-action="继续"]:visible').click();
  await expect(page.locator('[data-bar-action="暂停"]:visible')).toBeVisible({ timeout: 5_000 });
  console.log("[pause-race] resume after race OK");
});
