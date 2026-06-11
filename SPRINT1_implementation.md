# SPRINT1 — Implementation Plan

Phased implementation of [SPRINT1.md](./SPRINT1.md), grounded in the current codebase.

Status legend: ⬜ not started · 🟨 in progress · ✅ done

---

## Phase 1 — Backend data models ✅

*COMPLETED.* All core and API models extended. Old documents validate fine since new fields have Pydantic defaults.

Extend core + API Pydantic models. No behaviour change yet.

- `core/models.py`
  - `ConversationUser`: add `last_message_at: dict[str, datetime | None]` (keys `"media"`, `"voice"`, `"drawing"`), `timer_warning_dismissed: bool = False`
  - `User`: add `badges: dict[str, int] = {}` (badge name → cumulative count; level computed on read)
  - `MediaMetadata`: add `transcription: str | None = None`
  - `Conversation`: add reveal state — `reveal_ready_user_ids: list[str] = []`, `is_revealed: bool = False`, `analysis_status: str = "idle"` (`idle | running | done | failed`)
- `api/models.py`
  - Mirror the above in `ConversationUser`, `ConversationUserResponse`, `ConversationResponse`, `MediaMetadataResponse` (add `transcription`), `UserResponse` (add `badges`)
  - New: `MessagePost.message_type: str | None` (`"media" | "voice" | "drawing" | "text"`), `CooldownResponse`, `RevealStatusResponse`, `UserProfileResponse`
- New `core/badges.py`: hardcoded badge list (15 badges from spec) + `level_from_count(count)` using triangular numbers (level N reached at N×(N+1)/2 earnings)

**Files**: `backend/core/models.py`, `backend/api/models.py`, `backend/core/badges.py` (new)

## Phase 2 — Message cooldown (30 min, per type) ✅

*COMPLETED.* CooldownActiveError raised from registry; API returns HTTP 429 with `retry_after_seconds`; cooldowns endpoint live.

- `core/conversations_store.py`: persist new `ConversationUser` fields; helper `set_last_message_at(conversation_id, user_id, type)`
- `core/stores_registry.py` / `api/api.py` `post_message`:
  - Determine message type from `message.message_type` (sent by frontend) with fallback inference from media MIME type
  - If type ∈ {media, voice, drawing} and `now - last_message_at[type] < 30 min` → return **HTTP 429** with `retry_after_seconds`
  - On success: update `last_message_at[type]`
- Timer warning: `PATCH /api/chat/{id}/user/{uid}` accepts `timer_warning_dismissed: true` (persisted server-side)
- New endpoint `GET /api/chat/{id}/cooldowns` → per-type remaining seconds for the requesting user

**Files**: `backend/api/api.py`, `backend/core/stores_registry.py`, `backend/core/conversations_store.py`

## Phase 3 — Speech-to-text (Mistral Voxtral) ✅

*COMPLETED.* `core/transcription.py` calls Voxtral on audio upload; `requests` dependency added; transcription stored on `MediaMetadata`.

- `core/config.py`: add `MISTRAL_API_KEY` (env var — must be set in `.env.dev` / `.env.prod`)
- New `core/transcription.py`: call `POST https://api.mistral.ai/v1/audio/transcriptions` with model `voxtral-mini-latest`; graceful failure → `transcription = None`
- `core/medias_store.py` `upload_media` (or `stores_registry.add_message`): when uploaded file is audio, transcribe synchronously before returning the response; store in `MediaMetadata.transcription`
- Expose `transcription` in `MediaMetadataResponse` (already added Phase 1)

**Files**: `backend/core/transcription.py` (new), `backend/core/medias_store.py`, `backend/core/stores_registry.py`, `backend/core/config.py`

## Phase 4 — Reveal mechanic + profile endpoints (backend) ✅

*COMPLETED.* `POST reveal-ready`, `GET reveal-status`, `GET /users/{id}/profile` endpoints implemented; WS events `reveal_ready_changed`, `reveal_triggered` added to consumer.

- `POST /api/chat/{id}/reveal-ready`: records requesting user in `reveal_ready_user_ids`; if `len(ready) ≥ ceil(50% of current members)` → set `is_revealed = true` (permanent), WS broadcast `reveal_triggered`
- `GET /api/chat/{id}/reveal-status`: `{ready_count, member_count, is_revealed, user_is_ready}`
- WS event `reveal_ready_changed` on each tap (live counter)
- `GET /api/users/{user_id}/profile`: username, badges with computed levels, past conversations, stats (total messages, parties attended)
- Guard: reveal button flow only valid when `is_locked = true`

**Files**: `backend/api/api.py`, `backend/core/stores_registry.py`, `backend/core/conversations_store.py`, `backend/core/websocket/consumers.py`

## Phase 5 — Frontend: 3-tile input grid ✅

*COMPLETED.* `InputTileGrid`, `DrawingCanvas`, `TimerWarningModal` created; `sendMessage` refactored for `message_type` + 429 handling; `useCooldowns` hook with server+local tick.

Replace text input row in `ChatPage.tsx` with a 3-tile grid component:

- `InputTileGrid.tsx` (new): Photo/Video tile, Voice tile, Drawing tile; each shows per-type countdown (from `GET cooldowns` + local tick), greyed-out while cooling down
- `DrawingCanvas.tsx` (new): full-screen canvas (pointer events, color + stroke width, undo, clear) → PNG export via `canvas.toBlob()` → sent through existing media pipeline with optional caption
- Photo/video tile reuses `PhotoUploader` flow + caption; Voice tile reuses `useAudioRecorder`/`AudioRecorder`
- First-send warning modal: shown before the user's first send if `timer_warning_dismissed` is false; "Don't warn me again" → `PATCH user` with `timer_warning_dismissed: true`
- `sendMessage` includes `message_type`; handle 429 → toast + refresh cooldowns

**Files**: `frontend/src/components/chat/InputTileGrid.tsx` (new), `DrawingCanvas.tsx` (new), `TimerWarningModal.tsx` (new), `ChatPage.tsx`, `frontend/src/hooks/useCooldowns.ts` (new)

## Phase 6 — Frontend: timeline strip + teaser mode ✅

*COMPLETED.* `TimelineStrip` with dot ordering, expand/collapse, end-of-timeline indicator; `TeaserOverlay` with deterministic decorations; blur on others' messages until `is_revealed`.

- `TimelineStrip.tsx` (new): fixed ~40px left strip; colored dot per message (media `#FF8C42`, voice `#9B72CF`, drawing `#4ECDC4`), ordered by timestamp; tap strip → expand panel with timestamps; tap dot → scroll feed to message (via message refs); bottom indicator: disco dancer GIF while unlocked, 🏁 when `is_locked`
- Teaser mode (while `is_revealed = false`): in message rendering —
  - Own messages fully visible
  - Others: first ~10 chars visible, rest `blur(8px)`; media blurred with 🔥/“???” overlays; voice waveform blurred + transcription hidden; drawings blurred + 🎉🎊✨ decorations
  - Decorative overlays chosen deterministically per message id (stable across renders)
- `TeaserOverlay.tsx` (new) wrapping message bubbles

**Files**: `frontend/src/components/chat/TimelineStrip.tsx` (new), `TeaserOverlay.tsx` (new), `ChatPage.tsx`

## Phase 7 — Frontend: reveal button + post-it wall ✅

*COMPLETED.* `RevealButton`, `RevealWall` (masonry post-it wall + cassette cards), `MiniProfileSheet` bottom drawer created; conditionally swaps timeline+messages for wall on `is_revealed`.

- `RevealButton.tsx` (new): shown when `is_locked && !is_revealed`; live "X / Y members ready" via WS `reveal_ready_changed`; tap → `POST reveal-ready`
- `RevealWall.tsx` (new): masonry/staggered grid replacing chat scroll once revealed —
  - Text → post-it card · Photo/video → polaroid · Voice → cassette card (player + transcription) · Drawing → sketch-paper card
  - Card background: pastel color from author's `smiley` (hash emoji code points → HSL, S≈40%, L≈85%) — shared util `lib/signature.ts`
  - Author badge displayed on each card; tap card → `MiniProfileSheet.tsx` bottom drawer (full badge collection)
  - Progressive reveal animation (staggered wave)
- Loading state if `analysis_status === "running"` when wall opens
- Users arriving post-reveal see the wall directly (driven by `is_revealed` from `GET conversation`)

**Files**: `frontend/src/components/chat/RevealButton.tsx`, `RevealWall.tsx`, `MiniProfileSheet.tsx` (new), `frontend/src/lib/signature.ts` (new), `ChatPage.tsx`

## Phase 8 — Badges + profile page (frontend) ✅

*COMPLETED.* `ProfilePage` with stats, badge list with levels, past parties; routed via `App.tsx` state (`showProfile`); `AppHeader` has "My profile" dropdown item.

- `ProfilePage.tsx` (new): reachable from app header; Gravatar avatar + username, full badge collection with levels (triangular-number util mirrored client-side), past parties list, simple stats — from `GET /api/users/{id}/profile`
- Badge level display component shared between profile page, mini profile sheet, reveal cards

**Files**: `frontend/src/components/profile/ProfilePage.tsx` (new), `BadgeCollection.tsx` (new), `App.tsx`, header components

## Phase 9 — Chat analyser redesign + async trigger 🟨

*IN PROGRESS.* Asynchronous trigger on `is_locked` in `patch_conversation`; needs `../chat-analyser` repo modifications for badge assignment + pseudo→user_id mapping.

What can be done in this repo:
- `patch_conversation` (`api/api.py`): when `is_locked` flips to `true`, fire analysis asynchronously (thread/`asyncio.to_thread`), set `analysis_status`, WS push `analysis_complete` on finish
- Pass canonical `pseudo → user_id` mapping built from `ConversationUser.pseudo` (fallback `User.username`)
- On analysis completion: for each `UserFeedback.badge`, increment `User.badges[badge]` (at most one badge per user per party)
- Remove/repurpose the synchronous `GET chat/{id}/analyse` path

**Files**: `backend/api/api.py`, `backend/core/stores_registry.py`, `backend/core/users_store.py`, + external `chat-analyser` repo

## Phase 10 — Tests ⬜

*PENDING.* No tests written yet.

Per the spec test matrix (`backend/tests/`, frontend as feasible):
- Cooldown: per-type enforcement, 429 on violation, expiry, independent timers
- Timer warning: `timer_warning_dismissed` persists
- Voxtral: transcription stored on voice upload (mocked API)
- Reveal: ≥50% active-members threshold, permanence, post-reveal joiners
- Badges: count increment, triangular level computation
- Signature color util: deterministic emoji → pastel HSL

---

## Suggested execution order

1 → 2 → 3 (backend foundations) · 4 (reveal backend) · 5 → 6 → 7 (frontend core UX) · 8 (profile) · 9 (analyser — needs source repo) · 10 (tests alongside each phase)
