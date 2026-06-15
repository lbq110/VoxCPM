export type BookMeta = {
  title: string;
  author: string;
  /** The text with recognized leading metadata lines removed. */
  body: string;
};

function clean(s: string): string {
  return s
    .trim()
    .replace(/^#+\s*/, "")
    .replace(/^\*+|\*+$/g, "")
    .replace(/^["'“「『《【]+|["'”」』》】]+$/g, "")
    .trim();
}

function isChapterLine(s: string): boolean {
  const t = s.replace(/^#+\s*/, "").trim();
  return (
    /^第\s*[0-9零一二三四五六七八九十百千两]+\s*[章节卷回部篇集]/.test(t) ||
    /^[0-9]{1,4}$/.test(t) ||
    /^chapter\b/i.test(t) ||
    /^(序章|楔子|前言|序言|序|后记|尾声|番外)\b/.test(t)
  );
}

function looksLikeTitle(s: string): boolean {
  const t = s.replace(/^#+\s*/, "").trim();
  const len = Array.from(t).length;
  return len > 0 && len <= 30 && !/[。.！？!?，,；;]$/.test(t) && !isChapterLine(t);
}

function nextNonEmpty(lines: string[], from: number): number {
  for (let i = from; i < lines.length; i++) {
    if (lines[i].trim()) return i;
  }
  return -1;
}

const TITLE_LABEL = /^(?:书名|题名|标题|title)\s*[:：]\s*(.+)$/i;
const AUTHOR_LABEL = /^(?:作者|著者|author|by)\s*[:：]\s*(.+)$/i;
const BRACKET_TITLE = /^[《【]([^》】]{1,36})[》】]$/;
const ZHU_AUTHOR = /^(.{1,20}?)\s*著$/;
const MD_H1 = /^#\s+(.+?)\s*#*$/;

/**
 * Extract a book's title and author from its raw text, and return the body
 * with the recognized leading metadata lines stripped. Designed to adapt to
 * arbitrary TXT/Markdown books, and to never invent a title from real prose.
 */
export function extractBookMeta(raw: string): BookMeta {
  let text = raw.replace(/\r/g, "");
  let title = "";
  let author = "";

  // 1. YAML frontmatter
  const fm = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (fm) {
    const t = fm[1].match(/(?:^|\n)\s*title\s*[:：]\s*(.+)/i);
    const a = fm[1].match(/(?:^|\n)\s*author\s*[:：]\s*(.+)/i);
    if (t) title = clean(t[1]);
    if (a) author = clean(a[1]);
    text = text.slice(fm[0].length);
  }

  const lines = text.split("\n");
  const consumed = new Set<number>();
  let firstNonEmpty = -1;
  let seen = 0;

  for (let i = 0; i < lines.length && seen < 8; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (firstNonEmpty < 0) firstNonEmpty = i;
    seen += 1;

    const titleLabel = line.match(TITLE_LABEL);
    if (titleLabel) {
      if (!title) title = clean(titleLabel[1]);
      consumed.add(i);
      continue;
    }
    const authorLabel = line.match(AUTHOR_LABEL);
    if (authorLabel) {
      if (!author) author = clean(authorLabel[1]);
      consumed.add(i);
      continue;
    }
    const bracket = line.match(BRACKET_TITLE);
    if (bracket) {
      if (!title) title = bracket[1].trim();
      consumed.add(i);
      continue;
    }
    const zhu = line.match(ZHU_AUTHOR);
    if (zhu && !isChapterLine(line) && !/[。！？!?]/.test(zhu[1])) {
      if (!author) author = clean(zhu[1]);
      consumed.add(i);
      continue;
    }
    const mdH1 = line.match(MD_H1);
    if (mdH1) {
      // keep the heading in the body (it doubles as the first chapter title);
      // the renderer de-dups it against the book title on page one.
      if (!title && !isChapterLine(mdH1[1].trim())) title = clean(mdH1[1]);
      continue;
    }

    // a bare first line is a title only with a corroborating next line
    if (i === firstNonEmpty && !title && looksLikeTitle(line)) {
      const nIdx = nextNonEmpty(lines, i + 1);
      const next = nIdx >= 0 ? lines[nIdx].trim() : "";
      const nextAuthorLabel = AUTHOR_LABEL.test(next);
      const nextZhu = ZHU_AUTHOR.test(next) && !isChapterLine(next);
      const nextChapter = isChapterLine(next);
      const nextBareName =
        !!next &&
        Array.from(next).length <= 10 &&
        !/[。.！？!?，,；;：:#]/.test(next) &&
        !isChapterLine(next) &&
        !TITLE_LABEL.test(next);
      if (nextAuthorLabel || nextZhu || nextChapter || nextBareName) {
        title = clean(line);
        consumed.add(i);
        if (nextBareName && !nextAuthorLabel && !nextZhu) {
          author = clean(next);
          consumed.add(nIdx);
        }
        continue;
      }
    }

    // anything else is body — stop scanning
    break;
  }

  const body = lines.filter((_, i) => !consumed.has(i)).join("\n").trim();
  return { title, author, body };
}
