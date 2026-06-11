# SPRINT1 Implementation Memory Dump

Created: 2026-06-11
Last updated: after Phase 9, note-UI redesign, and gamification extras

## Post-sprint additions (2026-06-11)

- **Phase 9 done**: analyser triggers async on lock (`asyncio.to_thread` in `patch_conversation`), badges awarded from `UserFeedback.badge`, `GET /chat/{id}/analyse` returns `AnalysisResponse` (`users_feedbacks` list keyed by `user_id`). Wheel rebuilt from `../chat-analyser` source (single-call mode ≤200 msgs, weighted merge, pseudo→user_id mapping).
- **Note UI redesign**: feed bubbles → `MessageTile.tsx` paper notes (signature pastel + accent bar, tape on first of streak, polaroid/cassette/sketch inner frames); input → ruled cream paper sheet with tape, `font-note` + `.note-ruled` utilities in `index.css`, sticker-stamp send button.
- **Gamification trio**:
  1. `lib/dares.ts` + 🎲 dice sticker on the note sheet → rolls a party dare chip (cleared on send/dismiss)
  2. `PartyHeatMeter.tsx` in chat header: 🧊→☁️→😎→🔥→🌋 from messages in last 15 min, 30s cooldown tick, hidden once revealed
  3. Analyser extras: `party_title`, `quote_of_the_night`, `quote_author` (party-wide) + `wildness_score` 0-100 per user — golden 🏆 card atop RevealWall + 🌶️ % chip next to badges; passthrough via `AnalysisResponse`/`AnalysisUserFeedback`

---

## Project Context

- **Repo**: `Vladeptres/crapulex` at `/home/julien-gaste/bourracho_env/crapulex`
- **Stack**: Django + Django Ninja (backend), React + Vite + Tailwind (frontend), MongoDB, Redis, Daphne ASGI
- **API base**: `NinjaAPI()` with `urls_namespace="api"` → all endpoints prefixed with `/api/`
- **Backend port**: `localhost:8002` (Daphne ASGI server for WebSocket support)
- **Frontend**: deployed to Vercel, uses generated SDK from HeyAPI
- **WebSocket**: `ws://localhost:8002/ws/chat/{conversation_id}/`
- **External analyser**: `../chat-analyser` repo (outside workspace), installed as wheel `chat_analyser-0.1.0-py3-none-any.whl`

---

## Phase 1 — Backend Data Models (✅ DONE)

### Changes Made

**`backend/core/models.py`**
- `ConversationUser`: added `last_message_at: dict[str, datetime | None]` (keys: media, voice, drawing) with default factory; added `timer_warning_dismissed: bool = False`
- `User`: added `badges: dict[str, int] = Field(default_factory=dict)` — badge name → cumulative count; level computed on read via triangular numbers
- `MediaMetadata`: added `transcription: str | None = None`
- `Message`: added `message_type: Literal["text","media","voice","drawing"] = "text"`
- `Conversation`: added `reveal_ready_user_ids: list[str]`, `is_revealed: bool = False`, `analysis_status: Literal["idle","running","done","failed"] = "idle"`

**`backend/api/models.py`**
- Mirrored all core model changes in request/response schemas
- Added `MessagePost.message_type`, `CooldownResponse`, `CooldownErrorResponse`, `RevealStatusResponse`, `UserProfileResponse`

**`backend/core/badges.py` (new)**
- 15 hardcoded badges with emoji + description
- `level_from_count(count)` — triangular numbers: level N at N×(N+1)/2 total earnings
- `badges_with_levels(badges)` → expanded dict with computed level

**Key design decision**: Old Mongo documents validate fine because Pydantic defaults fill missing fields. No migration needed.

---

## Phase 2 — Message Cooldown (✅ DONE)

### Changes Made

**`backend/core/config.py`**
- Added `MISTRAL_API_KEY`, `MISTRAL_TRANSCRIPTION_MODEL` (default `voxtral-mini-latest`)
- Added `MESSAGE_COOLDOWN_SECONDS` (default 1800 = 30 min)

**`backend/core/stores_registry.py`**
- Added `CooldownActiveError` exception with `message_type` + `retry_after_seconds`
- Added `_infer_message_type()` — resolves from `MessagePost.message_type` then falls back to media MIME type (audio → voice, any media → media, else text)
- Added `get_cooldowns(conversation_id, user_id)` → dict of remaining seconds per type
- `add_message()` now: 1) infers type, 2) checks cooldown → raises `CooldownActiveError`, 3) uploads media, 4) stores message, 5) sets `last_message_at[type]`
- `_as_utc(dt)` helper normalizes naive Mongo datetimes to UTC aware

**`backend/core/conversations_store.py`**
- `update_conversation_user()` now accepts `timer_warning_dismissed`
- Added `set_last_message_at()`, `add_reveal_ready_user()`, `set_revealed()`, `set_analysis_status()`

**`backend/api/api.py`**
- `post_message` endpoint: response tuple now includes `429: CooldownErrorResponse`; catches `CooldownActiveError` → 429 JSON with `error`, `message_type`, `retry_after_seconds`
- New endpoint: `GET /api/chat/{id}/cooldowns` → `CooldownResponse`
- `ConversationUserUpdate` includes `timer_warning_dismissed`; `PATCH /user/{uid}` passes it through
- `ConversationUserResponse` includes `timer_warning_dismissed`

**Frontend `hooks/useCooldowns.ts`**
- Polls `GET cooldowns` endpoint + local tick-down every second
- `startCooldown(type)` optimistically starts countdown after successful send

---

## Phase 3 — Speech-to-Text (✅ DONE)

### Changes Made

**`backend/pyproject.toml`**
- Added `requests>=2.31.0` dependency

**`backend/core/transcription.py` (new)**
- `transcribe_audio(uploaded_file)` → calls `POST https://api.mistral.ai/v1/audio/transcriptions`
- Model: `voxtral-mini-latest`
- Non-fatal: returns `None` on any error, logs warning if `MISTRAL_API_KEY` missing
- Handles `file_obj.seek(0)` before and after to coexist with media upload

**`backend/core/stores_registry.py`**
- `add_message()` media loop: after `upload_media()`, if `metadata.type == "audio"`, calls `transcribe_audio()` and stores result in `metadata.transcription`
- `_message_to_response()` passes `transcription` through to `MediaMetadataResponse`

**Environment note**: `MISTRAL_API_KEY` must be set in `.env.dev` / `.env.prod` for transcription to work.

---

## Phase 4 — Reveal Mechanic Backend (✅ DONE)

### Changes Made

**`backend/core/stores_registry.py`**
- `mark_reveal_ready(conversation_id, user_id)`:
  - Guards: conversation must be locked, user must be member
  - Already revealed → no-op
  - Adds user to ready list (idempotent)
  - Threshold: `ceil(member_count / 2)` of *current* members (filters out leavers)
  - Triggers: `set_revealed()` + returns `(ready_count, member_count, is_revealed)`
- `get_reveal_status()` → `{ready_count, member_count, is_revealed, user_is_ready}`
- `award_badge(user_id, badge)` → `$inc` on Mongo user document
- `get_user_profile(user_id)` → `{id, username, pseudo, badges, past_parties, total_messages, parties_attended}`

**`backend/api/api.py`**
- `POST /api/chat/{id}/reveal-ready` → async, calls `mark_reveal_ready`, WS broadcasts `reveal_ready_changed` (live counter) and `reveal_triggered` if threshold met
- `GET /api/chat/{id}/reveal-status` → `RevealStatusResponse`
- `GET /api/users/{id}/profile` → `UserProfileResponse`

**`backend/core/websocket/consumers.py`**
- Added handlers: `reveal_ready_changed`, `reveal_triggered`, `analysis_status_changed`

---

## Phase 5 — Frontend 3-Tile Input Grid (✅ DONE)

### New Files

**`frontend/src/components/chat/InputTileGrid.tsx`**
- 3 tiles: Photo/Video (🟠), Voice (🟣), Drawing (🟢)
- Each shows countdown above tile when on cooldown; greyed-out + disabled
- Voice tile toggles recording via `handleVoiceToggle`
- Photo tile triggers hidden `<input type="file" accept="image/*,video/*">`

**`frontend/src/components/chat/DrawingCanvas.tsx`**
- Full-screen dialog with HTML5 canvas (pointer events)
- Color picker (10 colors), stroke width picker (4 sizes), eraser toggle
- Undo/redo with history stack (last 24 states), clear
- Export via `canvas.toBlob()` → PNG → passed to `onSend(blob)`
- Send button disabled until something is drawn

**`frontend/src/components/chat/TimerWarningModal.tsx`**
- "Hold on! ⏳" modal on first send of a cooldown-type message
- Checkbox: "Don't warn me again" → persists server-side via `PATCH timer_warning_dismissed`
- Session-level `warnedThisSessionRef` prevents repeated modals per session

**`frontend/src/hooks/useCooldowns.ts`**
- Fetches `GET /chat/{id}/cooldowns` on mount + conversation change
- Local `setInterval` tick-down every second
- `formatCooldown(seconds)` → `M:SS`

### ChatPage Integration
- Replaced text input row with: caption textarea + send button + 3-tile grid below
- `sendMessage()` now checks cooldown-type → shows timer warning modal if needed
- `doSendMessage()` includes `message_type` in form data, handles 429 → toast + cooldown refresh
- Drawing blob appears in media preview area (white background thumbnail)
- Audio blob preview via inline recorder toggle

---

## Phase 6 — Timeline Strip + Teaser Mode (✅ DONE)

### New Files

**`frontend/src/lib/signature.ts`**
- `hashString(str)` — djb2 deterministic hash
- `pastelColorFromEmoji(emoji)` → HSL(emoji_hash, 40%, 85%)
- `accentColorFromEmoji(emoji)` → HSL(emoji_hash, 45%, 60%)
- `getMessageKind(message)` → resolves from `message_type` field or media inference
- `TIMELINE_COLORS` → {media: '#FF8C42', voice: '#9B72CF', drawing: '#4ECDC4', text: '#A0A0A0'}

**`frontend/src/components/chat/TimelineStrip.tsx`**
- Fixed left strip (~40px, expandable to ~112px with `w-28`)
- Dots ordered by message timestamp
- Tap dot → `scrollToMessage(messageId)` with highlight ring
- Expand/collapse handle ("«"/"»")
- End-of-timeline indicator: 🪩 bouncing while unlocked, 🏁 when locked

**`frontend/src/components/chat/TeaserOverlay.tsx`**
- Wraps other users' messages while `!isRevealed`
- Deterministic decorations (2-3 emojis) per message id
- Mystery "???" badge on media content
- Used for: text (first 10 chars visible, rest blur[8px]), media (blur[8px]), voice, drawings

### ChatPage Integration
- Timeline strip placed as sibling to messages container inside `flex flex-1`
- Teaser logic: `isTeased = !isRevealed && !isOwn`
- Text: first 10 chars visible, rest `<span className="blur-[8px]">`
- Media: full `blur-[8px]` inside `TeaserOverlay`
- Reactions menus still functional on teased messages

---

## Phase 7 — Reveal Button + Post-It Wall (✅ DONE)

### New Files

**`frontend/src/components/chat/RevealButton.tsx`**
- Shown when `is_locked && !is_revealed`
- Fetches initial status, overrides with live WS `reveal_ready_changed`
- `POST /chat/{id}/reveal-ready` on tap
- Disabled after tap ("Waiting for the others... 🫶")
- Live counter: "X / Y members ready"

**`frontend/src/components/chat/RevealWall.tsx`**
- CSS columns masonry (2 cols mobile, 3 desktop)
- Card types:
  - **Text** → post-it card (colored background, slight rotation)
  - **Media** → polaroid card (white frame, `pb-6` shadow)
  - **Drawing** → sketch paper (dashed border)
  - **Voice** → cassette card (dark bg, dual circles + `AudioPlayer` + transcription quote)
- Card background = author's signature pastel from `pastelColorFromEmoji(smiley)`
- Each card shows author's badge earned this party
- Tap card → `MiniProfileSheet` with full badge collection
- Progressive wave animation: `visibleCount` increments every 120ms via `useEffect`
- Loading banner when `analysisStatus === "running"`

**`frontend/src/components/chat/MiniProfileSheet.tsx`**
- Bottom drawer (fixed bottom-0, rounded-t-2xl)
- Fetches `GET /users/{id}/profile`
- Shows avatar/username, stats, full badge list with levels
- Backdrop click to close

### ChatPage Integration
- Conditional render: `isRevealed ? <RevealWall/> : <TimelineStrip + Messages/>`
- WS events: `reveal_triggered` sets `revealOverride(true)`, `analysis_status_changed` updates state
- Analysis badges loaded from `GET /chat/{id}/analyse` after reveal

---

## Phase 8 — Profile Page + Badge Collection (✅ DONE)

### New Files

**`frontend/src/components/profile/ProfilePage.tsx`**
- Back button + scrollable content
- Identity: Gravatar avatar + username + pseudo
- Stats grid: messages sent, parties attended
- Badge collection: emoji, name, description, count, level (with next-level threshold hint)
- Past parties list: name, id, 🏁/🎉 lock indicator

### Integration
- `App.tsx`: added `showProfile` state, conditional render before `ChatPage`
- `WelcomeScreen`: added `onOpenProfile` prop
- `AppHeader`: added "My profile" dropdown item with `User` icon

---

## Phase 9 — Analyser Redesign (🟨 IN PROGRESS)

### What remains

1. **`backend/api/api.py` `patch_conversation`**: when `is_locked` flips `false → true`:
   - Set `analysis_status = "running"`
   - Fire analysis asynchronously (thread/`asyncio.to_thread`)
   - Build canonical `pseudo → user_id` mapping from `ConversationUser`
   - On completion: set `analysis_status = "done"`, WS push `analysis_status_changed`
   - Award badges: for each `UserFeedback.badge`, call `registry.award_badge()`

2. **`../chat-analyser` repo** (outside workspace):
   - Needs badge assignment in output (`UserFeedback.badge`)
   - Needs `pseudo → user_id` mapping support
   - Per-user subsequences, weighted merge, single-call mode for <200 msgs

3. **`GET /chat/{id}/analyse`**:
   - Currently synchronous; may need to become a status check
   - Or remove and let analysis trigger automatically on lock

---

## Phase 10 — Tests (⬜ PENDING)

No tests written yet. Matrix from spec:
- Cooldown enforcement, 429, expiry
- Timer warning persistence
- Voxtral transcription (mocked)
- Reveal threshold, permanence
- Badge count/level computation
- Signature color determinism

---

## Known Issues / Notes

1. **MISTRAL_API_KEY**: Must be set in `.env.dev` / `.env.prod` for transcription to work.
2. **Generated SDK**: New endpoints (`cooldowns`, `reveal-ready`, `reveal-status`, `profile`) are NOT in the generated SDK yet. Frontend uses raw `fetch()` for these.
3. **`message_type` field**: Generated types don't include it. Frontend casts `MessageResponse` to access `message_type`. Backend serializes it properly.
4. **`is_revealed` / `analysis_status`**: Generated `ConversationResponse` doesn't include these. Frontend casts the response object.
5. **WebSocket URL**: Frontend uses `import.meta.env.VITE_API_URL?.replace(/^http/, 'ws')` — production should use `wss://` via `VITE_WS_BASE_URL` env var.
6. **Drawing file type**: Drawing canvas exports PNG, uploaded as `image/png`. Backend infers `media` type from MIME type. The `message_type: "drawing"` field ensures correct classification.
7. **Audio transcription visibility**: In teaser mode, transcription is hidden (blur). In reveal wall, transcription shows as italic quote below cassette player.
8. **Badge awarding**: Currently only `award_badge()` backend method exists. Actual awarding from analyser output not wired yet (needs Phase 9).
9. **First-send warning**: Uses session ref + server-side `timer_warning_dismissed`. If user clears browser storage, they'll still be warned if server flag is false.
10. **Reveal threshold**: `ceil(member_count / 2)` — for 3 members, threshold is 2 (not 1.5). For 1 member, threshold is 1 (they can reveal alone).

---

## File Inventory (New + Modified)

### New Files
- `backend/core/badges.py`
- `backend/core/transcription.py`
- `frontend/src/hooks/useCooldowns.ts`
- `frontend/src/lib/signature.ts`
- `frontend/src/components/chat/InputTileGrid.tsx`
- `frontend/src/components/chat/DrawingCanvas.tsx`
- `frontend/src/components/chat/TimerWarningModal.tsx`
- `frontend/src/components/chat/TimelineStrip.tsx`
- `frontend/src/components/chat/TeaserOverlay.tsx`
- `frontend/src/components/chat/RevealButton.tsx`
- `frontend/src/components/chat/RevealWall.tsx`
- `frontend/src/components/chat/MiniProfileSheet.tsx`
- `frontend/src/components/profile/ProfilePage.tsx`

### Modified Files
- `backend/core/models.py`
- `backend/api/models.py`
- `backend/core/config.py`
- `backend/core/conversations_store.py`
- `backend/core/stores_registry.py`
- `backend/api/api.py`
- `backend/core/websocket/consumers.py`
- `backend/pyproject.toml`
- `frontend/src/App.tsx`
- `frontend/src/components/chat/ChatPage.tsx`
- `frontend/src/components/auth/WelcomeScreen.tsx`
- `frontend/src/components/layout/AppHeader.tsx`
