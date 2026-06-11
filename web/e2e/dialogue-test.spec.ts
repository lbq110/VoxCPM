/**
 * 对谈 (dialogue): streams a speaker-labelled script, spoiler-safe payload.
 */
import { test, expect } from "@playwright/test";

const TEXT = [
  "1",
  "起初，呼衍朵尼驮着紫貂皮来访，王恢在红山口岸迎接。",
  ...Array.from({ length: 15 }, (_, i) => `第${i + 2}段：马厩翻建工程的琐事，史曹们议论纷纷，进度缓慢。`),
  "当前位置：单于决定向汉国申请和亲，以麻痹汉军。",
  "未读剧情：田蚡突然升任太尉，权倾朝野。",
].join("\n");

test("dialogue streams speaker-labelled script without spoilers", async ({ page }) => {
  test.setTimeout(150_000);

  let payload: Record<string, unknown> | null = null;
  await page.route("**/api/book/dialogue", async (route) => {
    payload = route.request().postDataJSON() as Record<string, unknown>;
    await route.continue();
  });

  await page.goto("http://localhost:3001/book", { waitUntil: "domcontentloaded" });
  await page.evaluate((t) => {
    localStorage.clear();
    localStorage.setItem("book-companion:jiyuan:text", t);
  }, TEXT);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  // flip to the second-to-last page (before the unread plot point)
  const reader = page.locator("[data-reading-block]").first().locator("..").locator("..");
  const box = (await reader.boundingBox())!;
  for (let i = 0; i < 20; i++) {
    const info = await page.evaluate(() => {
      const m = document.querySelector("[data-page-indicator]")?.textContent?.match(/(\d+)\s*\/\s*(\d+)/);
      return m ? { c: Number(m[1]), t: Number(m[2]) } : { c: 1, t: 1 };
    });
    if (info.c >= info.t - 1) break;
    await page.mouse.click(box.x + box.width * 0.9, box.y + box.height * 0.5);
    await page.waitForTimeout(250);
  }

  // open dialogue panel and generate
  await page.locator("button:visible", { hasText: "问书" }).first().click();
  await page.waitForTimeout(400);
  await page.locator("button:visible", { hasText: "对谈" }).first().click();
  await page.waitForTimeout(300);
  await page.locator("button:visible", { hasText: "生成本章对谈" }).first().click();

  // streaming: transcript grows
  const transcript = page.locator("[data-dialogue-transcript]");
  await expect(transcript).toContainText("：", { timeout: 60_000 });
  const early = (await transcript.textContent())!.length;
  await page.waitForTimeout(2500);
  const later = (await transcript.textContent())!.length;
  console.log(`[dialogue] streaming: ${early} -> ${later} chars`);
  expect(later).toBeGreaterThan(early);

  // wait for completion
  for (let i = 0; i < 90; i++) {
    const busy = await page.locator("button:visible", { hasText: "正在生成" }).count();
    if (!busy) break;
    await page.waitForTimeout(1000);
  }
  const text = (await transcript.textContent()) ?? "";

  // speaker-labelled lines for both roles (TTS-ready)
  expect(text).toMatch(/许知远式[：:]/);
  expect(text).toMatch(/研究者[：:]/);
  console.log("[dialogue] speaker labels OK");

  // transport-level spoiler check: the request payload must not contain
  // anything from the unread part of the book
  const body = JSON.stringify(payload);
  expect(body).not.toContain("太尉");
  expect(body).not.toContain("田蚡突然");
  console.log("[dialogue] payload spoiler-free OK");
  await page.screenshot({ path: ".observe/dialogue.png" });
});
