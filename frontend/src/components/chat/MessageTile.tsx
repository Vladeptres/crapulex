import type { MessageResponse } from '@/api/generated'
import AudioPlayer from './AudioPlayer'
import PhotoDisplay from './PhotoDisplay'
import TeaserOverlay from './TeaserOverlay'
import { getUserInitials } from '@/lib/gravatar'
import {
  getMessageKind,
  hashString,
  pastelColorFromEmoji,
  accentColorFromEmoji,
} from '@/lib/signature'

const resolveMediaUrl = (url: string): string => {
  if (!url) return url
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  const apiUrl = import.meta.env.VITE_API_URL || ''
  return `${apiUrl}${url.startsWith('/') ? '' : '/'}${url}`
}

const formatTime = (timestamp: string) => {
  const utcTimestamp =
    timestamp.endsWith('Z') || timestamp.includes('+')
      ? timestamp
      : timestamp + 'Z'
  return new Date(utcTimestamp).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Paris',
  })
}

/* Feed rotations are gentler than the RevealWall's +/-3deg so the vertical
   reading flow stays comfortable. Tape tilt uses another slice of the same
   hash so tape and tile do not always lean the same way. */
const TILE_ROTATIONS = [-1.5, -0.75, 0, 0.75, 1.5]
const TAPE_TILTS = [-6, -3, 3, 6]

interface MessageTileProps {
  message: MessageResponse
  isOwn: boolean
  /** Teaser mode: other users' messages stay blurred until the reveal */
  isTeased: boolean
  /**
   * conversation.is_visible — when false the whole tile is blurred and the
   * signature pastel is swapped for neutral paper so the color cannot leak
   * who wrote what.
   */
  isVisible: boolean
  /** First message of a consecutive-author streak gets the tape strip */
  isFirstOfGroup: boolean
  smiley?: string
  displayName: string
}

/**
 * One chat message rendered as a paper note tile — the live-feed companion
 * of the RevealWall post-it cards: the author's signature pastel paper with
 * an accent top bar, a deterministic hand-placed rotation, and polaroid /
 * cassette / sketch inner frames per message kind.
 */
export default function MessageTile({
  message,
  isOwn,
  isTeased,
  isVisible,
  isFirstOfGroup,
  smiley,
  displayName,
}: MessageTileProps) {
  const paper = isVisible ? pastelColorFromEmoji(smiley) : 'hsl(0, 0%, 88%)'
  const accent = isVisible ? accentColorFromEmoji(smiley) : 'hsl(0, 0%, 60%)'
  const seed = hashString(message.id)
  const rotation = TILE_ROTATIONS[seed % TILE_ROTATIONS.length]
  const tapeTilt = TAPE_TILTS[(seed >> 3) % TAPE_TILTS.length]
  const medias = message.medias_metadatas || []
  const imageMedias = medias.filter(media => media.type === 'image')
  const audioMedias = medias.filter(media => media.type === 'audio')
  const hasMedia = medias.length > 0
  const hasTextContent = !!message.content
  const messageKind = getMessageKind(message)

  /* Inner frames per kind, shared by the teaser and revealed branches:
     media -> white polaroid (thick bottom), drawing -> dashed sketch paper,
     voice -> dark cassette with two reels (matches the RevealWall cards). */
  const framedMedia = (
    <>
      {imageMedias.length > 0 && (
        <div
          className={
            messageKind === 'drawing'
              ? 'rotate-[0.5deg] border-2 border-dashed border-gray-300 bg-white p-1.5'
              : 'rotate-[-0.5deg] bg-white p-1.5 pb-5 shadow-sm'
          }
        >
          {imageMedias.map(media => (
            <PhotoDisplay
              key={media.id}
              src={resolveMediaUrl(media.presigned_url)}
              alt={
                isTeased
                  ? 'Hidden until reveal'
                  : messageKind === 'drawing'
                    ? 'Drawing'
                    : 'Shared photo'
              }
              className="max-w-full"
            />
          ))}
        </div>
      )}
      {audioMedias.length > 0 && (
        <div className="space-y-1.5 rounded-md bg-gray-800 p-2">
          <div className="flex justify-center gap-5">
            <span className="h-4 w-4 rounded-full border-[3px] border-gray-500 bg-gray-700" />
            <span className="h-4 w-4 rounded-full border-[3px] border-gray-500 bg-gray-700" />
          </div>
          {audioMedias.map(media => (
            <AudioPlayer
              key={media.id}
              audioUrl={resolveMediaUrl(media.presigned_url)}
              className="w-full max-w-xs"
            />
          ))}
        </div>
      )}
    </>
  )

  return (
    <div
      className={`relative min-w-36 max-w-full rounded-sm px-3 pt-2 pb-2 ${!isVisible ? 'blur-xs' : ''}`}
      style={{
        backgroundColor: paper,
        borderTop: `4px solid ${accent}`,
        transform: `rotate(${rotation}deg)`,
        // Own notes are "signed": inset ring in your own accent color
        boxShadow: isOwn
          ? `inset 0 0 0 1.5px ${accent}, 1px 2px 5px rgba(0, 0, 0, 0.25)`
          : '1px 2px 5px rgba(0, 0, 0, 0.25)',
      }}
    >
      {/* Tape strip: only the first note of a streak is taped to the wall */}
      {isFirstOfGroup && (
        <span
          aria-hidden
          className="absolute -top-2.5 left-1/2 z-10 h-4 w-12 rounded-[1px] bg-white/50 shadow-[0_1px_2px_rgba(0,0,0,0.15)] backdrop-blur-[1px]"
          style={{ transform: `translateX(-50%) rotate(${tapeTilt}deg)` }}
        />
      )}

      {/* Signed header: identity lives on the note, not in a side column */}
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1.5">
          {smiley ? (
            <span className="text-sm leading-none">{smiley}</span>
          ) : (
            <span
              className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[8px] font-bold text-white"
              style={{ backgroundColor: accent }}
            >
              {getUserInitials(displayName)}
            </span>
          )}
          <span className="font-note truncate text-[11px] font-semibold text-gray-700">
            {isOwn ? 'You' : displayName}
          </span>
        </div>
        {message.timestamp && (
          <span className="shrink-0 text-[10px] text-gray-500 tabular-nums">
            {formatTime(message.timestamp)}
          </span>
        )}
      </div>

      {/* Media / voice / drawing — teaser blur identical to the old bubbles */}
      {hasMedia &&
        (isTeased ? (
          <TeaserOverlay messageId={message.id} kind={messageKind}>
            <div className="space-y-2 blur-[8px] pointer-events-none select-none">
              {framedMedia}
            </div>
          </TeaserOverlay>
        ) : (
          <div className="space-y-2">{framedMedia}</div>
        ))}

      {/* Text — same 10-char preview + blur, now handwritten on the paper */}
      {(hasTextContent || !hasMedia) &&
        (isTeased && hasTextContent ? (
          <TeaserOverlay messageId={message.id} kind="text">
            <p
              className={`font-note text-sm leading-snug text-gray-800 break-words whitespace-pre-wrap ${hasMedia ? 'mt-1.5' : ''}`}
            >
              {/* First ~10 chars visible, rest blurred */}
              <span>{message.content.slice(0, 10)}</span>
              {message.content.length > 10 && (
                <span className="blur-[8px] select-none">
                  {message.content.slice(10)}
                </span>
              )}
            </p>
          </TeaserOverlay>
        ) : (
          <p
            className={`font-note text-sm leading-snug text-gray-800 break-words whitespace-pre-wrap ${hasMedia ? 'mt-1.5' : ''}`}
          >
            {message.content}
          </p>
        ))}
    </div>
  )
}
