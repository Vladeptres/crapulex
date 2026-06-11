# Objective

Users experience feedback indicate:

- **ALL USERS** We don't want to interact with a messaging app during a party. The classic note that people pass hand to hand to each other works better. This is due to unpersonal interface and traditional messaging app appearance. On the other hand, when someone passes you a phone note telling you "Note your feelings about tonight's party before you forget about it" it makes you feel like you're part of the night and makes you write something.
- **Secondary feedbacks**:
  - Some messages are garbage, there is no incentive to send real content about your night adventure, some users just send random stuff about their day or their life that shadows real night content.
  - Speech to text feature would be incredible when at some time of the night typing is harder. Without it people stop using the app at some point of the night.
  - After a party, scrolling the conversation feels a bit unpersonal. It misses the point to have a real party timeline with events popping rather than scrolling messages.
  - Drawings would be a nice feature: too complex to formulate? draw stick persons having fun and everybody will understand what happened.


# New UI design

## Input: 3-tile grid

Instead of a text input field, users see a 3-tile grid with:
- **Photo/Video tile** — attach media + optional text caption (media-only or text-only also valid)
- **Voice recording tile** — record audio in-app; auto-transcribed on send via Mistral Voxtral
- **Drawing tile** — free canvas; exported as PNG + optional text caption

## Message timer (30-minute cooldown)

Each tile type has its own independent 30-minute server-side cooldown. A user can send at most one photo/video, one voice recording, and one drawing per 30-minute window — 3 messages per half hour maximum.

- **Backend**: add `last_message_at: dict[str, datetime | None]` (keyed by type: `"media"`, `"voice"`, `"drawing"`) to `ConversationUser`. Reject `POST /api/chat/{id}/messages/` with HTTP 429 if the relevant type is still on cooldown.
- **Frontend**: display a per-type countdown above each tile. Greyed-out + countdown when on cooldown, active when available.
- **First-send warning**: on the user's very first send in a conversation, show a confirmation modal: "You won't be able to send this type of message for 30 minutes. OK / Don't warn me again." If user selects "Don't warn me again", persist server-side via `timer_warning_dismissed: bool` on `ConversationUser` and never show the modal again.

## Timeline UI (mobile-first)

Replace the classic chat scroll with a timeline layout:

- **Left strip (~40px wide)**: fixed vertical strip showing colored dots for each message, ordered by time.
  - Photo/video → warm orange `#FF8C42`
  - Voice → soft purple `#9B72CF`
  - Drawing → mint green `#4ECDC4`
- **Tap to expand**: tapping the strip reveals a wider panel with timestamps.
- **Dot interaction**: tapping a dot scrolls the message feed to that message. While `is_locked = false`, message stays blurred at destination. Once revealed, scrolls to the unblurred card.
- **End-of-timeline indicator**: while `is_locked = false`, show an animated disco dancer GIF (free public domain asset) at the bottom of the strip. When admin locks (`is_locked = true`), replace with 🏁 finish flag.

## Teaser mode (`is_locked = false`)

- **Own messages**: always fully visible.
- **Others' messages**: first ~10 characters of text visible, rest CSS-blurred (`filter: blur(8px)`). Static decorative overlays applied at message arrival:
  - Text messages: sparkles, question mark overlays, emoji borders around the bubble
  - Pictures/videos: 🔥 emojis, sticker-style overlays, "???" badges
  - Voice messages: waveform blurred, transcription hidden, music note overlays
  - Drawings: blurred canvas, floating party emoji decorations (🎉🎊✨)
- Wide range of effects — make it feel funny and alive.

## Reveal mechanic

### Admin lock → reveal eligibility

When admin locks the conversation (`is_locked = true`):
1. A large **"Reveal the night 🎉"** button appears at the top of the chat for all members.
2. Button shows a live counter: "3 / 8 members ready".
3. When **≥ 50% of current active members** (those who haven't left the conversation) tap it, the reveal fires for everyone simultaneously — including those who haven't tapped.
4. Users opening the app after the reveal already triggered see the revealed view directly, no button shown.
5. Reveal is permanent and cannot be undone.

### Reveal view (post-it wall)

Messages displayed as a styled card wall, not a chat scroll:

- **Text** → post-it card
- **Photo/video** → polaroid card
- **Voice** → cassette/tape card (audio player + transcription below)
- **Drawing** → sketch paper card

Each card uses the **author's signature pastel color and emoji** (`smiley` on `ConversationUser`). Color derived deterministically client-side: hash emoji Unicode code point(s) → HSL with saturation ~40%, lightness ~85%.

Layout: masonry or staggered grid. Reveal animation: cards appear progressively (wave or one-by-one).

Each card also displays the **badge earned by the author in this party**.

## User signature (emoji + color)

Each user receives a random emoji at join time (`smiley` on `ConversationUser`). Pastel color derived client-side from emoji hash. Used for: timeline dots, post-it card backgrounds, message bubble borders in reveal mode.

## User badges

Badges are awarded by the analyser at the end of each party (when admin locks) and **persist on the user across all conversations**.

### Badge list (hardcoded — LLM picks one per user per party)

| Badge | Behaviour it rewards |
|---|---|
| 🦁 Party Animal | Most active presence throughout the night — sent the most overall |
| 📸 Photographer of the Night | Most photos/videos sent |
| 🎤 Storyteller | Richest text content, longest and most detailed messages |
| 💃 Dance Machine | High energy, consistent presence all night long |
| 🌟 SuperStar | Most reactions and votes received from others |
| 🎨 Picasso | Most drawings sent |
| 🦉 Night Owl | Still active the latest in the night |
| 🐣 Early Bird | First person to send a message |
| 👻 Silent Watcher | Joined but barely sent anything — the lurker |
| 🔥 Hype Man | Most emoji reactions given to others |
| 🎙️ Voice of the Night | Most voice messages sent |
| 🚀 Trendsetter | First person to receive reactions from others |
| 💎 Diamond of the Night | Outstanding standout — reserved for truly exceptional moments |
| 😈 Casanova | Most flirtatious content — suggestive messages, drawings, energy |
| 🥴 Three Sheets | Messages clearly showing the progression of the night — bravely incoherent |

### Badge level system

Each badge has a level that grows as the user earns the same badge across multiple parties. Thresholds follow **triangular numbers** — to reach Level N, the badge must have been earned N×(N+1)/2 times total:

| Level | Total earnings needed |
|---|---|
| 1 | 1 |
| 2 | 3 |
| 3 | 6 |
| 4 | 10 |
| 5 | 15 |
| N | N×(N+1)/2 |

- **Data model**: add `badges: dict[str, int]` to `User` (key = badge name, value = cumulative count). Level computed from count on read, never stored.
- A user holds multiple different badge types simultaneously, each with its own level.
- At most one badge awarded per party per user — if someone was exceptional on multiple dimensions, the LLM picks the most fitting one.

### Badge display

- **Reveal view**: badge shown publicly on each user's post-it card — everyone sees who earned what this night.
- **Profile page**: full badge collection with levels, across all parties.
- Tapping a user's card in the reveal view opens a **mini profile sheet** (bottom drawer) showing their full badge collection.


# Backend improvements

## Speech-to-text

Use **Mistral Voxtral** (`voxtral-mini-latest`) via `POST /v1/audio/transcriptions`.

- Trigger: on the fly when a voice message is sent, before returning the response to the client.
- Extend `MediaMetadata` with `transcription: str | None`.
- Frontend: transcription hidden in teaser mode, shown below the cassette card player in reveal mode.
- Rationale: spreads API calls across the night rather than batching at party end.

## Chat analyser redesign (`../chat-analyser`)

### Current problems

1. **Equal chunk weighting** (`analyser.py:79`): user who only sent messages in the last 2 of 10 chunks gets diluted in the merge step.
2. **Generic feedback for low-content users**: 3 messages across 300 → LLM barely mentions them → hallucinated summary.
3. **Nickname attribution failure**: `users` passed as raw strings; `ConversationUser.pseudo` ≠ `User.username` → misattribution.

### Redesign direction

- Build **per-user message subsequences** with surrounding context before chunking.
- Weight the merge step with explicit metadata: message count per user, time-of-night distribution.
- Pass a **canonical pseudo → user_id mapping** (from `ConversationUser.pseudo`, fallback to `User.username`).
- For conversations under ~200 messages: replace chunk-then-merge with a single long-context call.
- Add **badge assignment** to analyser output: LLM picks one badge per user from the hardcoded list above.

### Output schema additions

`UserFeedback` gains:
- `badge: str` — badge name chosen from hardcoded list

### Trigger

Runs **automatically and asynchronously when admin locks the conversation** (`PATCH /api/chat/{id}` with `is_locked = true`). Frontend polls or receives a WebSocket push when analysis is complete. Reveal view shows a loading state if analysis is still running when users open it.

## User profile page (new)

New page reachable from the app header and via bottom drawer on post-it card tap in the reveal view.

Contents:
- Username + avatar (Gravatar, already implemented)
- Full badge collection with levels
- Past parties list (conversations the user participated in)
- Simple stats: total messages sent, parties attended


# Testing improvements

Nice-to-have, lowest priority. Track required tests per feature:

| Feature | Tests needed |
|---|---|
| Message timer | Per-type cooldown enforcement, 429 on violation, cooldown expiry |
| Timer warning modal | First-send modal shown, "don't warn me again" persists server-side |
| Speech-to-text (Voxtral) | Transcription stored in `MediaMetadata.transcription` on voice upload |
| Timeline UI | Color per type, dot ordering by timestamp, dot tap scrolls to message |
| Teaser mode | Blur on others, own messages unblurred, 10-char preview correct |
| Reveal mechanic | ≥50% active-members threshold triggers reveal for all, permanent after |
| Reveal view | Cards per type, pastel color per user, masonry layout, badge on card |
| Badge system | One badge per party, count incremented on `User.badges`, level computed correctly |
| Analyser redesign | Per-user isolation, weighted merge, nickname mapping, badge assignment |
| Drawing | Canvas PNG export, caption attachment, media pipeline reuse |
| Profile page | Badge display with levels, past parties list, stats correct |