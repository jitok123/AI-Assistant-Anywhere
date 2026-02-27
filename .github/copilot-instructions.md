# Copilot instructions for `telephone_ai_anywhere`

## Big picture (read this first)
- This is an Expo Router React Native app; page entry points are in `app/`, core logic is in `src/`.
- Runtime orchestration lives in `src/store/index.ts` (Zustand): `sendMessage` is the end-to-end pipeline (persist user msg → RAG retrieval → Agent/LLM → stream UI updates → persist AI msg → async post-processing).
- Keep boundaries stable: UI/components should call store actions; service modules in `src/services/` should stay focused and stateless where possible.

## Agent + model routing conventions
- `src/services/agent.ts` uses **keyword intent routing**, not OpenAI Function Calling, for cross-model compatibility.
- Current routes: image generation (`image_gen`) → time query (`time_query`) → web search + synthesis (`web_search`) → normal chat fallback.
- Do not put markdown image syntax in assistant content; pass generated image via `Message.generatedImageUrl` and render in `src/components/MessageBubble.tsx`.
- Multimodal image understanding is orchestrated in `src/store/index.ts`: vision analysis (`qwen-vl-max`) can chain into web search in the same turn when query intent requires freshness.

## Streaming + loading behavior (critical)
- Streaming is implemented with XHR SSE parser in `src/services/deepseek.ts` (`streamWithXHR`) because RN fetch streaming is unreliable.
- Preserve `onStream(chunk, done)` semantics; `done=true` must clear loading quickly.
- Stream UI updates can be throttled for performance (current target ~66ms), but `done=true` must always bypass throttle and flush immediately.
- `isLoading` has multiple safeguards in store (stream done, catch paths, and `finally` + 120s safety timeout). Avoid changes that can leave loading stuck.
- Post-conversation heavy jobs are intentionally debounced/asynchronous; avoid adding synchronous expensive work in the message-response hot path.

## Android keyboard + input visibility (critical)
- Chat input must remain visible when software keyboard is opened on Android real devices.
- Keep keyboard behavior aligned across config and runtime (`app.json` keyboard layout mode + chat page layout strategy).
- For this project, avoid double-avoidance on Android (`softwareKeyboardLayoutMode=resize` + `KeyboardAvoidingView` together can cause bottom gap on some OEM ROMs).
- If chat-page layout is adjusted (`app/index.tsx`, `ChatInput`), verify no regression in: keyboard open, first message sent, second message send, and drawer/settings clickability.
- Avoid solutions that only pass emulator; prioritize behavior on physical Android devices (e.g., iQOO/MIUI/ColorOS variants).

## Text-first UX for DeepSeek (critical)
- DeepSeek is text-centric in this app; prioritize readability over decorative UI.
- Keep Chinese copy concise and natural; improve line-height, paragraph spacing, and visual hierarchy before adding extra visual ornaments.
- Markdown rendering should avoid noisy formatting and preserve long-form answer readability.
- For structured content, support readable renderers: LaTeX block math and Mermaid diagrams (with tap-to-zoom preview) without degrading plain-text readability.

## Multi-attachment conventions (new)
- `sendMessage` supports mixed attachments in one turn (`attachments`), including multiple images and files.
- Persist attachment metadata via `Message.attachments` and SQLite `messages.attachments_json`; keep backward compatibility with legacy single-file fields.
- UI input state for pending files is array-based (`ChatInput`), and rendering should iterate `attachments` first, then gracefully fall back to legacy `imageUri/fileUri`.
- `app/rag.tsx` supports multi-select ingestion for text / pdf / image files; bulk ingestion should continue even if one file fails.
- Generated image cards should provide local save/download action from `MessageBubble`.

## RAG architecture and memory policy
- Multi-layer RAG is implemented in `src/services/ragSpecialist.ts`: `emotional`, `rational`, `historical`, plus `general` layer from `src/services/rag.ts`.
- Retrieval is weighted by layer (`multiLayerSearch`) and injected into system prompt via `buildRagContext`.
- Post-conversation updates are async/non-blocking by design (`postConversationUpdate`, `addChatToRag`); keep UI responsiveness higher priority than immediate RAG consistency.

## Data model and persistence rules
- SQLite schema + migrations are centralized in `src/services/database.ts` (`initDatabase`). Use additive, backward-safe migrations wrapped in `try/catch`.
- When adding message features, update both TS types (`src/types/index.ts`) and message table serialization/deserialization (`addMessage`, `getMessages`, `getRecentMessages`, import/export methods).
- Conversation ordering depends on `touchConversation` after writes.

## External integrations (one key reused in many places)
- `deepseekApiKey` + `deepseekBaseUrl` are for chat completion.
- `dashscopeApiKey` is reused for embeddings, web search, image generation, and ASR (`embedding.ts`, `webSearch.ts`, `imageGen.ts`, `voice.ts`).
- Settings UX and defaults must stay aligned across `src/types/index.ts` defaults and `app/settings.tsx` controls.

## Developer workflow for this repo
- Install/run: `npm install`, `npm run start`, `npm run android`.
- Tests: `npm test`, `npm run test:watch`, `npm run test:coverage`, `npm run test:ci`.
- Android build flows are project-specific: `npm run build:apk:debug`, `npm run build:apk:local`, `npm run build:apk:eas`, `npm run build:aab`.
- Jest config is in `jest.config.json` with RN/Expo mocks in `__tests__/setup.ts`.

## Project-specific coding patterns
- User-facing copy is primarily Chinese; keep error messages and labels consistent with existing Chinese UX tone.
- Prefer extending existing service files over introducing parallel abstractions.
- Keep changes small and traceable: if touching pipeline behavior, verify effects in `app/index.tsx` + `src/components/ChatInput.tsx` + `src/components/MessageBubble.tsx` together.
- Architecture notes live in `架构文档/log7_*.md` to `log12_*.md`; use them as authoritative design context before refactors.
- For UI changes, align style references with "Google clarity + Apple calm" while preserving performance on Android mid/high-end devices.
