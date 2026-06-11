/**
 * Large-book stress test: a ~400k character book must load and swipe
 * without freezing the main thread.
 */
import { test, expect } from "@playwright/test";

test("400k-char book: load + swipe stays responsive", async ({ page }) => {
  test.setTimeout(120_000);

  await page.goto("http://localhost:3001/book", { waitUntil: "domcontentloaded" });
  // build the text in-page to avoid a huge transfer
  await page.evaluate(() => {
    const pool = [
      "其实我对已知历史也没有特别强烈个人看法，基本相信这个世界来历的真实性，凡广为流传的过往都确曾发生过，差别只在叙事策略或史家个人局限上，这信念建立在不信人类有完全没影儿、无中生有能力基础上。",
      "选择汉武故事无他，只是碰巧对他这一朝几个人知道得更早，很小、不知汉武是谁前，就对“灌夫骂座”“金屋藏娇”这样的故事有印象，大概小时候家里有本前后汉故事集。",
      "当然其中还有另一层偷懒，人名现成，故事谅必也现成，当时我还陷入另一种枯竭或称疲惫，即将日复一日流水般生活描绘为、或称伪装为不同寻常遭际的热情及自我增强力。",
    ];
    const parts: string[] = [];
    let chapter = 1;
    let chars = 0;
    while (chars < 400_000) {
      parts.push(String(chapter++));
      for (let i = 0; i < 40; i++) {
        const p = pool[i % pool.length];
        parts.push(p);
        chars += p.length;
      }
    }
    localStorage.clear();
    localStorage.setItem("book-companion:jiyuan:text", parts.join("\n"));
  });

  const t0 = Date.now();
  await page.reload({ waitUntil: "domcontentloaded" });
  // wait until the page indicator shows real pagination (book interactive)
  await page.waitForFunction(
    () => {
      const m = document.querySelector("[data-page-indicator]")?.textContent?.match(/(\d+)\s*\/\s*(\d+)/);
      return m && Number(m[2]) > 10;
    },
    { timeout: 60_000 },
  );
  const loadMs = Date.now() - t0;
  console.log(`[bigbook] interactive in ${loadMs}ms`);

  // swipe 3 times, measuring responsiveness after each
  const cdp = await page.context().newCDPSession(page);
  async function swipe() {
    const y = 400;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 330, y }] });
    for (let i = 1; i <= 10; i++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 330 - 25 * i, y }] });
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  }

  for (let i = 0; i < 3; i++) {
    const s0 = Date.now();
    await swipe();
    // responsiveness probe: a trivial evaluate must return quickly
    await page.evaluate(() => 1);
    const ms = Date.now() - s0;
    console.log(`[bigbook] swipe ${i + 1} round-trip ${ms}ms`);
    expect(ms).toBeLessThan(3_000);
    await page.waitForTimeout(300);
  }

  expect(loadMs).toBeLessThan(8_000);
});
