/**
 * Native text selection (long-press / drag) must become the 问书 target.
 */
import { test, expect } from "@playwright/test";

const TEXT = [
  "目前所能掌握信息只有当年单于的称号，相当于我们的帝号，叫头曼；帐下人民万帐，相当于我们的万户。",
  "之后守边十一年基本都在搞工程，到二世元年蒙恬受诛，只记载了一次出黄河占领阳山北假的行动，亦无斩获记录。",
  "小栾说，匈奴方面材料因限于口传亦多缺漏不实，我处多次派员深入匈奴。",
].join("\n");

test("native selection becomes the ask target", async ({ page }) => {
  await page.goto("http://localhost:3001/book", { waitUntil: "domcontentloaded" });
  await page.evaluate((t) => localStorage.setItem("book-companion:jiyuan:text", t), TEXT);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  // simulate a drag-selection over the SECOND paragraph via Range API
  await page.evaluate(() => {
    const spans = Array.from(
      document.querySelectorAll<HTMLElement>('p[data-reading-block] span[role="button"]'),
    ).filter((el) => el.offsetParent !== null);
    const target = spans.find((s) => s.textContent?.includes("守边十一年"));
    if (!target) throw new Error("target span not found");
    const range = document.createRange();
    range.selectNodeContents(target);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });
  await page.waitForTimeout(300);

  // open 问书 — selection may collapse, the captured text must survive
  await page.evaluate(() => window.getSelection()?.removeAllRanges());
  await page.locator("button:visible", { hasText: "问书" }).first().click();
  await page.waitForTimeout(500);

  const card = page.locator("text=已选文字").locator("..").locator("p").nth(1);
  const shown = (await card.textContent()) ?? "";
  console.log(`[selection] shown: "${shown.slice(0, 30)}..."`);
  expect(shown).toContain("守边十一年");
  expect(shown).not.toContain("头曼");
});
