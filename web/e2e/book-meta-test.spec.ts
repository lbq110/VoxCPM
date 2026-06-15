/**
 * The reader adapts to any book: title + author are extracted from the file,
 * metadata lines are stripped from the body, and everything (header, TOC,
 * dialogue persona) follows the imported book.
 */
import { test, expect } from "@playwright/test";

const BOOK_A = [
  "活着",
  "余华",
  "",
  "第一章",
  "我比现在年轻十岁的时候，获得了一个游手好闲的职业，去乡间收集民间歌谣。",
  "那年的整个夏天，我如同一只乱飞的麻雀，游荡在知了和阳光充斥的乡间。",
].join("\n");

const BOOK_B = [
  "# 城南旧事",
  "",
  "作者：林海音",
  "",
  "我们看海去，我们看海去，蓝色的大海上，扬着白色的帆。",
].join("\n");

async function loadBook(page: import("@playwright/test").Page, text: string) {
  await page.evaluate((t) => {
    localStorage.clear();
    localStorage.setItem("book-companion:jiyuan:text", t);
  }, text);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1800);
}

test("title + author extracted; body stripped; follows the book", async ({ page }) => {
  await page.goto("http://localhost:3001/book", { waitUntil: "domcontentloaded" });
  await loadBook(page, BOOK_A);

  // header title is the book title (not the chapter heading 第一章)
  await expect(page.locator("[data-page-indicator]").locator("..")).toContainText("活着");
  const headerTitle = await page.evaluate(() => {
    const ind = document.querySelector("[data-page-indicator]");
    return ind?.parentElement?.querySelector("div")?.textContent ?? "";
  });
  expect(headerTitle).toContain("活着");
  expect(headerTitle).not.toBe("第一章");

  // metadata lines stripped: the body must not render "余华" as its own block
  const firstBlocks = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-reading-block]'))
      .slice(0, 4)
      .map((el) => el.textContent?.trim() ?? ""),
  );
  console.log(`[meta] first blocks: ${JSON.stringify(firstBlocks)}`);
  expect(firstBlocks.some((t) => t === "余华")).toBe(false);
  expect(firstBlocks.join("")).toContain("我比现在年轻十岁");

  // TOC drawer shows title + author
  await page.locator("button:visible", { hasText: "目录" }).first().click();
  await page.waitForTimeout(400);
  await expect(page.locator("[data-book-title]")).toContainText("活着");
  await expect(page.locator("[data-book-author]")).toContainText("余华");
  console.log("[meta] TOC shows 活着 / 余华");
  await page.keyboard.press("Escape").catch(() => {});
  await page.locator("button:visible", { hasText: "×" }).first().click().catch(() => {});

  // dialogue persona follows the book
  let dlgPayload: Record<string, unknown> | null = null;
  await page.route("**/api/book/dialogue", async (route) => {
    dlgPayload = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ status: 200, headers: { "Content-Type": "text/plain" }, body: "许知远式：测试。\n研究者：好的。" });
  });
  await page.locator("button:visible", { hasText: "问书" }).first().click();
  await page.waitForTimeout(300);
  await page.locator("button:visible", { hasText: "对谈" }).first().click();
  await page.waitForTimeout(300);
  await page.locator("button:visible", { hasText: "生成本章对谈" }).click();
  await page.waitForTimeout(1500);
  const av = JSON.stringify(dlgPayload?.["authorView"] ?? "");
  console.log(`[meta] dialogue authorView: ${av}`);
  expect(av).toContain("余华");
  expect(av).toContain("活着");

  // switch to a different book → everything follows
  await loadBook(page, BOOK_B);
  const headerB = await page.evaluate(() => {
    const ind = document.querySelector("[data-page-indicator]");
    return ind?.parentElement?.querySelector("div")?.textContent ?? "";
  });
  expect(headerB).toContain("城南旧事");
  expect(headerB).not.toContain("活着");
  await page.locator("button:visible", { hasText: "目录" }).first().click();
  await page.waitForTimeout(400);
  await expect(page.locator("[data-book-author]")).toContainText("林海音");
  console.log("[meta] switched book -> 城南旧事 / 林海音");
});
