/**
 * EPUB import: a real .epub is built on disk with jszip, uploaded via the file
 * input, parsed in the browser, and fed through the existing text-import path.
 * Title/author come from the OPF (not a chapter name), and the body renders.
 */
import { test, expect } from "@playwright/test";
import JSZip from "jszip";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TITLE = "山月记";
const AUTHOR = "中岛敦";
const KNOWN_SENTENCE = "我深信自己并非凡庸之辈。";

const CONTAINER_XML = `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;

const OPF = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${TITLE}</dc:title>
    <dc:creator>${AUTHOR}</dc:creator>
  </metadata>
  <manifest>
    <item id="c1" href="chap1.xhtml" media-type="application/xhtml+xml"/>
    <item id="c2" href="chap2.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="c1"/>
    <itemref idref="c2"/>
  </spine>
</package>`;

const CHAP1 = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head><title>第一章</title></head>
  <body>
    <h1>第一章</h1>
    <p>${KNOWN_SENTENCE}</p>
    <p>陇西的李征博学多才 &amp; 才华横溢。</p>
  </body>
</html>`;

const CHAP2 = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head><title>第二章</title></head>
  <body>
    <h1>第二章</h1>
    <p>这是第二章的正文段落。</p>
  </body>
</html>`;

async function buildEpubFile(): Promise<string> {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip");
  zip.file("META-INF/container.xml", CONTAINER_XML);
  zip.file("OEBPS/content.opf", OPF);
  zip.file("OEBPS/chap1.xhtml", CHAP1);
  zip.file("OEBPS/chap2.xhtml", CHAP2);
  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  const path = join(tmpdir(), `voxcpm-epub-test-${Date.now()}.epub`);
  writeFileSync(path, buffer);
  return path;
}

test("import an EPUB: header, TOC, and body follow the OPF", async ({ page }) => {
  test.setTimeout(60_000);
  const epubPath = await buildEpubFile();

  await page.goto("http://localhost:3001/book", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  // upload the real .epub via the (hidden) file input
  await page
    .locator('input[type="file"][accept*="epub"]')
    .first()
    .setInputFiles(epubPath);
  await page.waitForTimeout(2000);

  // header shows the EPUB title (from OPF), not a chapter heading
  await expect(page.locator("[data-page-indicator]").locator("..")).toContainText(TITLE);
  const headerTitle = await page.evaluate(() => {
    const ind = document.querySelector("[data-page-indicator]");
    return ind?.parentElement?.querySelector("div")?.textContent ?? "";
  });
  console.log(`[epub] header title: ${headerTitle}`);
  expect(headerTitle).toContain(TITLE);
  expect(headerTitle).not.toBe("第一章");

  // body rendered: a known chapter sentence appears in a reading block
  const blockText = await page.evaluate(() =>
    Array.from(document.querySelectorAll("[data-reading-block]"))
      .map((el) => el.textContent ?? "")
      .join(""),
  );
  expect(blockText).toContain(KNOWN_SENTENCE);
  // entity decoded in body
  expect(blockText).toContain("博学多才 & 才华横溢");
  console.log("[epub] body rendered with known sentence + decoded entity");

  // TOC drawer shows title + author from the OPF
  await page.locator("button:visible", { hasText: "目录" }).first().click();
  await page.waitForTimeout(400);
  await expect(page.locator("[data-book-title]")).toContainText(TITLE);
  await expect(page.locator("[data-book-author]")).toContainText(AUTHOR);
  console.log(`[epub] TOC shows ${TITLE} / ${AUTHOR}`);
});
