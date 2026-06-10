# VoxCPM Web Lab

This Next.js app contains two local prototypes:

- Voice conversation lab at `/`
- Interactive book companion at `/book`

The app is designed for local testing first. API keys and imported book content
must stay out of Git.

## Run Locally

```sh
npm install
npm run dev -- --port 3001
```

Open:

```text
http://localhost:3001
http://localhost:3001/book
```

## Environment

Create `.env.local` from `.env.example`.

For Grok/OpenRouter-backed chat and book companion features:

```sh
OPENROUTER_API_KEY=sk-or-...
CHAT_MODEL=x-ai/grok-4.3
```

For the voice chat lab:

```sh
VOICE_SERVER_URL=http://localhost:8000
VOICE_API_KEY=
```

## Scripts

```sh
npm run lint
npm run typecheck
npm run build
```

## Voice Conversation Lab

The voice lab tests a ChatGPT-like speech conversation loop:

```text
Browser mic/text
  -> Next.js API routes
  -> SenseVoice-Small ASR
  -> OpenRouter Grok LLM
  -> VoxCPM2 TTS
  -> Web Audio playback
```

See `../CHAT_APP.md` for the full status, RunPod workflow, voice preset notes,
and GPU preparation checklist.

## Interactive Book Companion

The `/book` route is a mobile-first ebook reader prototype. It currently
supports:

- TXT/Markdown import;
- local storage persistence for imported text;
- mobile-style pagination;
- previous/next page controls;
- font size controls;
- background theme switching;
- passage selection, highlights, and notes;
- selected-passage Q&A through OpenRouter;
- two-person chapter dialogue generation.

See `../BOOK_COMPANION.md` for product requirements, implemented behavior,
known constraints, and next work.

## Important Files

- `src/components/Chat.tsx` — voice conversation UI.
- `src/components/BookCompanion.tsx` — ebook reader UI, parser, pagination, and
  companion interactions.
- `src/app/api/chat/route.ts` — streaming LLM route for the voice lab.
- `src/app/api/asr/route.ts` — ASR proxy route.
- `src/app/api/tts/route.ts` — TTS proxy route.
- `src/app/api/voices/*` — voice list/upload/manage routes.
- `src/app/api/book/companion/route.ts` — selected-passage book companion.
- `src/app/api/book/dialogue/route.ts` — chapter dialogue generator.
- `src/lib/config.ts` — server-only configuration.

## Do Not Commit

- `.env.local` or real API keys;
- imported book text;
- generated audio;
- `.next`;
- `node_modules`.
