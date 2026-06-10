# Interactive Book Companion

This document records the current product direction, implemented code, and
remaining work for the interactive ebook prototype.

## Product Positioning

The product goal is to turn a book into an interactive learning partner.

The first test book is Wang Shuo's `纪元`. The reader should feel close to a
mobile reading app such as WeRead, while adding an AI companion layer:

- read the imported chapter in a comfortable mobile-first reader;
- select a passage and ask the book companion questions;
- generate a two-person dialogue around the current chapter;
- later connect VoxCPM2 to read the book and generated dialogues aloud.

No book text is committed to the repository. Imported text stays in the
browser's local storage for local testing.

## Current Entry Points

- Web reader: `http://localhost:3001/book`
- Main voice chat lab: `http://localhost:3001/`
- Reader component: `web/src/components/BookCompanion.tsx`
- Reader page route: `web/src/app/book/page.tsx`
- Book companion API: `web/src/app/api/book/companion/route.ts`
- Chapter dialogue API: `web/src/app/api/book/dialogue/route.ts`

## Implemented Reader Features

- Mobile-first reading surface. Desktop is treated as a centered phone preview
  so the main design target remains mobile.
- TXT/Markdown import for local chapter text.
- Imported text is saved to `localStorage` under
  `book-companion:jiyuan:text`.
- WeRead-inspired controls:
  - previous page / next page;
  - font size decrease / increase;
  - theme switch: night, paper, white;
  - directory panel;
  - settings panel.
- DOM-measured mobile pagination. The app measures actual rendered block
  heights and repaginates to avoid text being hidden behind the bottom controls.
- Paragraph cleanup for copied reading text:
  - strips common Markdown inline syntax;
  - detects headings, quotes, lists, and horizontal rules;
  - keeps leading punctuation attached to the previous block;
  - avoids starting a new paragraph after weak punctuation such as `，`, `、`,
    and `：`;
  - marks continuation chunks so a page continuation does not look like a new
    paragraph;
  - renders visible two-character paragraph indentation for natural paragraph
    starts.
- `重新整理分段` button in settings. This reparses the saved local text with the
  current parser without requiring the user to reimport the file.
- Passage selection:
  - select a passage;
  - highlight it;
  - save it as a note;
  - ask the companion;
  - generate a dialogue based on nearby passages.

## Implemented AI Features

The reader uses the same OpenRouter configuration as the voice chat app:

- `OPENROUTER_API_KEY`
- `CHAT_MODEL`, defaulting to `x-ai/grok-4.3`

The `/api/book/companion` route answers questions about the selected passage.
The prompt is designed for short Chinese spoken-style explanations:

- one direct conclusion;
- 2-4 explanatory sentences;
- one short follow-up question.

The `/api/book/dialogue` route generates a two-person chapter dialogue. It is
currently a text preview, not audio. Available dialogue styles:

- `许知远式`
- `梁文道式`
- `窦文涛式`
- `李诞式`

The prompt deliberately treats these as style/role labels rather than claiming
real people are speaking.

## Local Development

```sh
cd web
npm install
npm run dev -- --port 3001
```

Open:

```text
http://localhost:3001/book
```

For AI companion and dialogue generation, create `web/.env.local` from
`web/.env.example` and set:

```sh
OPENROUTER_API_KEY=sk-or-...
CHAT_MODEL=x-ai/grok-4.3
```

Validation commands:

```sh
cd web
npm run lint
npm run typecheck
npm run build
```

## Known Constraints

- The current importer is heuristic. Text copied from a reading app may contain
  display line breaks rather than real paragraph breaks, so the parser has to
  infer paragraph boundaries.
- The reader is not yet backed by a database. Imported book text, notes,
  highlights, and reading progress are local to the browser session/storage.
- The current table of contents only reads Markdown headings. A production
  importer should build a real chapter tree from EPUB/Markdown metadata.
- The page model works with measured text blocks, not a full typesetting engine.
  It is good enough for prototype testing, but a production reader should have
  stronger pagination tests and deterministic text layout rules.
- Generated dialogue is text-only. Audio generation through VoxCPM2 is planned
  but not wired into `/book` yet.

## Next Work

1. Import pipeline
   - Add an explicit "clean imported text" step before saving.
   - Support TXT, Markdown, and EPUB-like chapter structures.
   - Add parser fixtures and tests for copied WeRead-style text.

2. Reading experience
   - Persist reading progress, font size, theme, notes, and highlights.
   - Add tap zones / swipe page turning for phone use.
   - Add a more useful directory once chapter metadata exists.
   - Polish page transitions and selection behavior.

3. Companion layer
   - Let the companion answer with chapter-level context, not only nearby
     passage snippets.
   - Add "explain", "challenge", "summarize", and "connect to today" modes.
   - Store generated answers as reusable notes.

4. Dialogue and blog generation
   - Let readers choose a chapter and dialogue partner.
   - Generate a two-person blog/dialogue article for the chapter.
   - Add export to Markdown/HTML.

5. VoxCPM2 audio
   - Add read-aloud for the current page or selected passage.
   - Add dialogue-to-audio using stable voice presets.
   - Reuse the RunPod GPU workflow documented in `CHAT_APP.md`.

6. Open Notebook integration
   - Use Open Notebook as the longer-term source/notebook layer.
   - Import book chapters as sources.
   - Generate notes, podcasts/dialogues, and learning artifacts from the same
     chapter context.

## Files To Know

- `BOOK_COMPANION.md` — this product and implementation status document.
- `CHAT_APP.md` — voice conversation lab, VoxCPM2, RunPod, and GPU prep notes.
- `web/src/components/BookCompanion.tsx` — reader UI, parser, pagination, notes,
  and interaction state.
- `web/src/app/book/page.tsx` — Next.js route for `/book`.
- `web/src/app/api/book/companion/route.ts` — selected-passage Q&A.
- `web/src/app/api/book/dialogue/route.ts` — chapter dialogue generation.
- `web/src/lib/config.ts` — server-side OpenRouter and voice server config.

## Git Hygiene

Do not commit:

- `web/.env.local` or API keys;
- imported book text;
- generated audio files;
- `.next`, `node_modules`, or other build artifacts.
