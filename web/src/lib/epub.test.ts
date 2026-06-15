import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { parseEpub } from "./epub";

const CONTAINER_XML = `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;

function chapter(heading: string, paragraph: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head><title>${heading}</title></head>
  <body>
    <h1>${heading}</h1>
    <p>${paragraph}</p>
  </body>
</html>`;
}

/** Build a minimal but valid EPUB archive in memory and return its bytes. */
async function buildEpub(opf: string): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip");
  zip.file("META-INF/container.xml", CONTAINER_XML);
  zip.file("OEBPS/content.opf", opf);
  zip.file(
    "OEBPS/chap1.xhtml",
    chapter("第一章", "盐与铁 &amp; 火，这是第一章的正文段落。"),
  );
  zip.file(
    "OEBPS/chap2.xhtml",
    chapter("第二章", "这是第二章的正文段落，紧随其后。"),
  );
  return zip.generateAsync({ type: "arraybuffer" });
}

const OPF_WITH_AUTHOR = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>纪元</dc:title>
    <dc:creator>王朔</dc:creator>
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

const OPF_NO_AUTHOR = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>无名之书</dc:title>
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

describe("parseEpub", () => {
  it("extracts title, author, and chapters in spine order", async () => {
    const data = await buildEpub(OPF_WITH_AUTHOR);
    const { title, author, body } = await parseEpub(data);

    expect(title).toBe("纪元");
    expect(author).toBe("王朔");

    // chapters appear in spine order
    const firstIdx = body.indexOf("第一章");
    const secondIdx = body.indexOf("第二章");
    expect(firstIdx).toBeGreaterThanOrEqual(0);
    expect(secondIdx).toBeGreaterThan(firstIdx);

    // <h1> became a markdown "# " heading line
    expect(body).toMatch(/^#\s+第一章$/m);
    expect(body).toMatch(/^#\s+第二章$/m);

    // paragraph text present, tags stripped, entity decoded
    expect(body).toContain("盐与铁 & 火，这是第一章的正文段落。");
    expect(body).not.toContain("<p>");
    expect(body).not.toContain("<h1>");
    expect(body).not.toContain("&amp;");
    expect(body).toContain("这是第二章的正文段落，紧随其后。");
  });

  it("returns empty author when the OPF has no creator", async () => {
    const data = await buildEpub(OPF_NO_AUTHOR);
    const { title, author } = await parseEpub(data);
    expect(title).toBe("无名之书");
    expect(author).toBe("");
  });

  it("throws a clear error for a non-zip / malformed file", async () => {
    const garbage = new TextEncoder().encode("this is not a zip file").buffer;
    await expect(parseEpub(garbage)).rejects.toThrow();
  });
});
