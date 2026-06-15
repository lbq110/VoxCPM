import JSZip from "jszip";

export type EpubBook = {
  title: string;
  author: string;
  body: string;
};

/**
 * Parse an EPUB archive into `{ title, author, body }`.
 *
 * The body is markdown-ish: `#`..`######` for headings, blank lines between
 * paragraphs — exactly the shape `parseBookText` already understands.
 *
 * Portability: this module is imported by both the browser and vitest (node),
 * so it must NOT use `DOMParser`. The OPF and XHTML are parsed with string and
 * regex logic, which runs identically in both environments.
 */
export async function parseEpub(data: ArrayBuffer): Promise<EpubBook> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    throw new Error("无法读取 EPUB 文件，可能已损坏或加密");
  }

  const container = await readFile(zip, "META-INF/container.xml");
  if (!container) {
    throw new Error("EPUB 缺少 META-INF/container.xml");
  }

  const opfPath = attr(container, "rootfile", "full-path");
  if (!opfPath) {
    throw new Error("EPUB 未找到 OPF 文件路径");
  }

  const opf = await readFile(zip, opfPath);
  if (!opf) {
    throw new Error(`EPUB 缺少 OPF 文件：${opfPath}`);
  }

  const title = cleanMeta(tagContent(opf, "title"));
  const author = cleanMeta(tagContent(opf, "creator"));

  const baseDir = dirOf(opfPath);
  const manifest = buildManifest(opf);
  const spineIds = spineOrder(opf);

  const chapters: string[] = [];
  for (const id of spineIds) {
    const href = manifest[id];
    if (!href) continue;
    const path = resolvePath(baseDir, href);
    const doc = await readFile(zip, path);
    if (!doc) continue;
    const text = htmlToText(doc);
    if (text) chapters.push(text);
  }

  const body = chapters.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
  return { title, author, body };
}

/** Read a zip entry as a UTF-8 string, tolerating leading-slash path variants. */
async function readFile(zip: JSZip, path: string): Promise<string | null> {
  const file =
    zip.file(path) ??
    zip.file(path.replace(/^\/+/, "")) ??
    findByBasename(zip, path);
  if (!file) return null;
  return file.async("string");
}

function findByBasename(zip: JSZip, path: string): JSZip.JSZipObject | null {
  const base = path.split("/").pop();
  if (!base) return null;
  let found: JSZip.JSZipObject | null = null;
  zip.forEach((relativePath, entry) => {
    if (!found && relativePath.split("/").pop() === base) found = entry;
  });
  return found;
}

/** Directory portion of a path ("OEBPS/content.opf" -> "OEBPS"). */
function dirOf(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx >= 0 ? path.slice(0, idx) : "";
}

/** Resolve an href relative to a base directory, collapsing ./ and ../ */
function resolvePath(baseDir: string, href: string): string {
  let rel = href.split("#")[0];
  try {
    rel = decodeURIComponent(rel);
  } catch {
    // keep raw href if it isn't valid percent-encoding
  }
  const parts = (baseDir ? `${baseDir}/${rel}` : rel).split("/");
  const stack: string[] = [];
  for (const part of parts) {
    if (part === "" || part === ".") continue;
    if (part === "..") stack.pop();
    else stack.push(part);
  }
  return stack.join("/");
}

/** Map manifest item id -> href. */
function buildManifest(opf: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const m of opf.matchAll(/<item\b[^>]*>/gi)) {
    const tag = m[0];
    const id = attrValue(tag, "id");
    const href = attrValue(tag, "href");
    if (id && href) map[id] = href;
  }
  return map;
}

/** Spine reading order as a list of manifest item ids. */
function spineOrder(opf: string): string[] {
  const spine = tagContent(opf, "spine");
  if (!spine) return [];
  return [...spine.matchAll(/<itemref\b[^>]*>/gi)]
    .map((m) => attrValue(m[0], "idref"))
    .filter((id): id is string => Boolean(id));
}

/** Content between the first <tag>...</tag>, namespace prefix optional. */
function tagContent(xml: string, tag: string): string {
  const re = new RegExp(
    `<(?:[\\w-]+:)?${tag}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${tag}>`,
    "i",
  );
  const m = xml.match(re);
  return m ? m[1] : "";
}

/** Value of an attribute on the first matching (namespace-optional) element. */
function attr(xml: string, tag: string, name: string): string {
  const re = new RegExp(`<(?:[\\w-]+:)?${tag}\\b[^>]*>`, "i");
  const m = xml.match(re);
  return m ? attrValue(m[0], name) : "";
}

/** Value of an attribute within a single start tag. */
function attrValue(tag: string, name: string): string {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "i"));
  return m ? m[1] : "";
}

/** Strip metadata noise: remove inner tags, decode entities, collapse spaces. */
function cleanMeta(raw: string): string {
  return decodeEntities(raw.replace(/<[^>]+>/g, ""))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Convert an XHTML/HTML document to markdown-ish text:
 * - <h1>..<h6> -> #..###### + heading text,
 * - <p>, <div>, <br> and block close tags -> line/paragraph breaks,
 * - remaining tags stripped, entities decoded, blank lines collapsed.
 */
function htmlToText(html: string): string {
  let s = html;

  // Work on the <body> only when present.
  const body = s.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (body) s = body[1];

  // Drop script/style content entirely.
  s = s.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "");

  // Headings -> markdown, with inner tags stripped from the heading text.
  s = s.replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, level, inner) => {
    const text = inner.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    return text ? `\n\n${"#".repeat(Number(level))} ${text}\n\n` : "\n\n";
  });

  // Explicit line breaks.
  s = s.replace(/<br\s*\/?>/gi, "\n");

  // Block boundaries -> paragraph breaks (both open and close forms).
  s = s.replace(
    /<\/(p|div|li|blockquote|section|article|figure|tr|table|ul|ol|pre)\s*>/gi,
    "\n\n",
  );
  s = s.replace(
    /<(p|div|li|blockquote|section|article|figure|tr|table|ul|ol|pre)\b[^>]*>/gi,
    "\n\n",
  );

  // Strip every remaining tag, THEN decode entities (so decoded < > can't
  // be re-read as tags).
  s = s.replace(/<[^>]+>/g, "");
  s = decodeEntities(s);

  // Normalize whitespace per line, then collapse runs of blank lines.
  s = s
    .split("\n")
    .map((line) => line.replace(/[ \t 　]+/g, " ").trimEnd())
    .join("\n");
  s = s.replace(/\n{3,}/g, "\n\n").trim();

  return s;
}

/** Decode the HTML entities that show up in real EPUBs. */
function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) =>
      safeCodePoint(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_m, dec) => safeCodePoint(parseInt(dec, 10)))
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function safeCodePoint(code: number): string {
  if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return "";
  try {
    return String.fromCodePoint(code);
  } catch {
    return "";
  }
}
