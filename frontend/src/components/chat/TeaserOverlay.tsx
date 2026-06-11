import type { ReactNode } from 'react'
import { hashString, type MessageKind } from '@/lib/signature'

interface TeaserOverlayProps {
  messageId: string
  kind: MessageKind
  children: ReactNode
}

/**
 * Decorative teaser wrapper applied to OTHER users' messages while the
 * conversation is not yet revealed. The wrapped content should already be
 * blurred by the caller; this adds the fun static overlays, chosen
 * deterministically per message id so they are stable across renders.
 */

const TEXT_DECORATIONS = ['✨', '❓', '💫', '🤐', '❔', '🫢']
const MEDIA_DECORATIONS = ['🔥', '🫣', '👀', '😱', '🤫', '🌶️']
const VOICE_DECORATIONS = ['🎵', '🎶', '🎤', '🔊', '🎧', '🤔']
const DRAWING_DECORATIONS = ['🎉', '🎊', '✨', '🎨', '🌀', '🖌️']

const DECORATIONS: Record<MessageKind, string[]> = {
  text: TEXT_DECORATIONS,
  media: MEDIA_DECORATIONS,
  voice: VOICE_DECORATIONS,
  drawing: DRAWING_DECORATIONS,
}

const POSITIONS = [
  '-top-2 -left-2',
  '-top-2 -right-2',
  '-bottom-2 -left-2',
  '-bottom-2 -right-2',
  'top-1/2 -left-3 -translate-y-1/2',
  'top-1/2 -right-3 -translate-y-1/2',
]

export default function TeaserOverlay({
  messageId,
  kind,
  children,
}: TeaserOverlayProps) {
  const seed = hashString(messageId)
  const pool = DECORATIONS[kind]
  const count = 2 + (seed % 2) // 2-3 decorations
  const decorations = Array.from({ length: count }, (_, i) => ({
    emoji: pool[(seed + i * 7) % pool.length],
    position: POSITIONS[(seed + i * 3) % POSITIONS.length],
    rotation: ((seed + i * 13) % 40) - 20,
  }))
  const showBadge = kind !== 'text' && seed % 3 !== 0

  return (
    <div className="relative inline-block">
      {children}

      {/* Emoji decorations around the bubble */}
      {decorations.map((d, i) => (
        <span
          key={i}
          className={`absolute ${d.position} text-base pointer-events-none select-none z-10`}
          style={{ transform: `rotate(${d.rotation}deg)` }}
          aria-hidden
        >
          {d.emoji}
        </span>
      ))}

      {/* "???" mystery badge on media-ish content */}
      {showBadge && (
        <span
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 px-2 py-0.5 rounded-full bg-black/60 text-white text-xs font-bold pointer-events-none select-none z-10"
          aria-hidden
        >
          ???
        </span>
      )}
    </div>
  )
}
