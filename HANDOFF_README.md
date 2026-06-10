# Project Handoff: Interactive Book Companion

This repository is a fork of VoxCPM with two local prototypes added on top:

- `VoxCPM Voice Conversation Lab`
- `Interactive Book Companion`

The next development focus is the interactive ebook experience at `/book`.

## Repository

```text
https://github.com/lbq110/VoxCPM
```

## First Documents To Read

Read these before changing code:

```text
BOOK_COMPANION.md   # Interactive ebook product direction, implemented features, TODOs
CHAT_APP.md         # Voice conversation lab, VoxCPM2, RunPod, GPU workflow
web/README.md       # Web app entry points and local development commands
```

For ebook work, start with `BOOK_COMPANION.md`.

## Local Setup

```sh
git clone https://github.com/lbq110/VoxCPM.git
cd VoxCPM/web
npm install
npm run dev -- --port 3001
```

Open:

```text
http://localhost:3001/book
```

The reader UI can be tested without API keys.

To test AI book companion features, create `web/.env.local` from
`web/.env.example` and set:

```sh
OPENROUTER_API_KEY=sk-or-...
CHAT_MODEL=x-ai/grok-4.3
```

## Main Product Goal

Turn a book into an interactive learning partner.

The reader should be able to:

- read comfortably on mobile;
- import a chapter or book text;
- ask questions about the current passage;
- generate a two-person chapter dialogue;
- later listen to the book or dialogue through VoxCPM2.

The first test content is Wang Shuo's `纪元`, but book text is not committed to
GitHub.

## Current Entry Points

```text
/       VoxCPM Voice Conversation Lab
/book   Interactive Book Companion
```

## Important Ebook Files

```text
web/src/components/BookCompanion.tsx
web/src/app/book/page.tsx
web/src/app/api/book/companion/route.ts
web/src/app/api/book/dialogue/route.ts
BOOK_COMPANION.md
web/README.md
```

## Current Ebook Features

Implemented:

- mobile-first reading page;
- TXT/Markdown import;
- imported text stored in browser `localStorage`;
- previous / next page controls;
- font size increase / decrease;
- background theme switching;
- passage selection;
- highlight and note capture;
- selected-passage Q&A through OpenRouter;
- two-person chapter dialogue generation;
- initial paragraph cleanup and pagination logic;
- `重新整理分段` action to reparse imported text after parser changes.

## Current Voice Conversation Features

The voice conversation lab is already in the repository and runs at `/`.

Implemented:

- browser microphone capture;
- SenseVoice-Small ASR path;
- Grok/OpenRouter chat path;
- VoxCPM2 TTS path through the voice server;
- voice selector and custom voice upload;
- continuous voice conversation loop;
- RunPod preparation scripts.

The previously tested `矮大紧` voice is documented as:

```text
u_wechat_20260529_210719
```

The audio sample itself is not committed. Real voice wav files, generated audio,
prompt cache, and API keys must stay out of Git.

## What Is Not In Git

Do not expect these to be in the repository:

- imported book text;
- `web/.env.local`;
- OpenRouter API keys;
- RunPod secrets;
- generated audio;
- custom voice wav files;
- model caches.

If the next developer needs to reproduce the exact local reading state, send the
source `.md` or `.txt` book file separately and import it through `/book`.

If the next developer needs to reproduce the exact `矮大紧` voice, restore the
voice preset on the voice server under `/workspace/voices` with its `voices.json`
entry and wav file, or upload a new reference voice sample from the UI.

## Recommended Next Priorities

1. Stabilize import parsing and pagination.
   - Add fixtures for copied WeRead-style text.
   - Build deterministic tests for paragraph boundaries.
   - Decide whether imported lines, blank lines, or Markdown structure should
     define paragraphs.

2. Persist reader state.
   - Reading progress.
   - Font size.
   - Theme.
   - Highlights.
   - Notes.

3. Improve mobile reading interactions.
   - Swipe to turn page.
   - Tap left/right zones to turn page.
   - Better selected-passage toolbar.
   - Smoother page transition.

4. Build chapter and directory support.
   - Parse Markdown headings.
   - Support chapter-level navigation.
   - Eventually support EPUB-like import.

5. Build chapter blog/dialogue generation.
   - Let the reader choose a chapter.
   - Let the reader choose a dialogue partner.
   - Generate a two-person blog-style conversation.
   - Export to Markdown or HTML.

6. Connect ebook output to VoxCPM2.
   - Read selected passage aloud.
   - Read current page aloud.
   - Convert generated dialogue into multi-voice audio.

7. Consider Open Notebook integration.
   - Use Open Notebook as the source/notebook layer.
   - Store book chapters as sources.
   - Generate notes, dialogues, and learning artifacts from the same context.

## Validation Commands

Run these from `web/`:

```sh
npm run lint
npm run typecheck
npm run build
```

## Suggested First Task For The Next Developer

Start by fixing the reader importer and pagination.

Reason: the current prototype proves the interaction model, but long-term
quality depends on whether copied/imported book text can be rendered as stable,
continuous mobile pages with correct paragraph indentation and page boundaries.

After that is stable, continue with persistent notes/highlights and chapter
dialogue generation.
