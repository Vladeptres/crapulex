import { useEffect, useState } from 'react'
import type { MessageResponse } from '@/api/generated'
import AudioPlayer from './AudioPlayer'
import PhotoDisplay from './PhotoDisplay'
import MiniProfileSheet from './MiniProfileSheet'
import {
  getMessageKind,
  hashString,
  pastelColorFromEmoji,
  accentColorFromEmoji,
  type MessageKind,
} from '@/lib/signature'

const resolveMediaUrl = (url: string): string => {
  if (!url) return url
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  const apiUrl = import.meta.env.VITE_API_URL || ''
  return `${apiUrl}${url.startsWith('/') ? '' : '/'}${url}`
}

interface UserBadge {
  name: string
  emoji: string
  /** 0-100 wildness score from the analysis */
  wildness?: number
}

interface PartyMeta {
  /** AI-invented name for the night */
  title: string
  /** Best verbatim quote of the night */
  quote: string
  quoteAuthor: string
}

interface RevealWallProps {
  messages: MessageResponse[]
  currentUserId: string
  conversationUserData: Record<string, { pseudo?: string; smiley?: string }>
  usernames: Record<string, string>
  /** Badge earned by each user during this party (from the analysis) */
  partyBadges: Record<string, UserBadge>
  /** Golden-card extras from the analysis (party title + quote of the night) */
  partyMeta?: PartyMeta | null
  isAnalysisRunning: boolean
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

const CARD_ROTATIONS = [-3, -2, -1, 0, 1, 2, 3]

/**
 * Post-it wall reveal view: messages displayed as styled cards in a
 * masonry-like staggered grid, colored with the author's signature pastel.
 * Cards appear progressively (staggered wave animation).
 */
export default function RevealWall({
  messages,
  currentUserId,
  conversationUserData,
  usernames,
  partyBadges,
  partyMeta,
  isAnalysisRunning,
}: RevealWallProps) {
  const [visibleCount, setVisibleCount] = useState(0)
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)

  const sortedMessages = [...messages].sort(
    (a, b) =>
      new Date(a.timestamp || 0).getTime() -
      new Date(b.timestamp || 0).getTime()
  )

  // Progressive reveal: cards appear one by one in a wave
  useEffect(() => {
    if (visibleCount >= sortedMessages.length) return
    const timer = setTimeout(() => {
      setVisibleCount(prev => Math.min(prev + 1, sortedMessages.length))
    }, 120)
    return () => clearTimeout(timer)
  }, [visibleCount, sortedMessages.length])

  const renderCardContent = (message: MessageResponse, kind: MessageKind) => {
    const medias = message.medias_metadatas || []
    const images = medias.filter(m => m.type === 'image')
    const audios = medias.filter(m => m.type === 'audio')

    switch (kind) {
      case 'media':
      case 'drawing':
        return (
          <div className="space-y-2">
            {/* Polaroid / sketch paper visual */}
            <div
              className={`bg-white p-2 ${kind === 'media' ? 'pb-6 shadow-md' : 'border-2 border-dashed border-gray-300'}`}
            >
              {images.map(media => (
                <PhotoDisplay
                  key={media.id}
                  src={resolveMediaUrl(media.presigned_url)}
                  alt={kind === 'drawing' ? 'Drawing' : 'Photo'}
                  className="w-full"
                />
              ))}
            </div>
            {message.content && (
              <p className="text-sm italic text-gray-700">{message.content}</p>
            )}
          </div>
        )
      case 'voice':
        return (
          <div className="space-y-2">
            {/* Cassette-style card */}
            <div className="bg-gray-800 rounded-lg p-3 space-y-2">
              <div className="flex justify-center gap-6">
                <span className="w-5 h-5 rounded-full border-4 border-gray-500 bg-gray-700" />
                <span className="w-5 h-5 rounded-full border-4 border-gray-500 bg-gray-700" />
              </div>
              {audios.map(media => (
                <AudioPlayer
                  key={media.id}
                  audioUrl={resolveMediaUrl(media.presigned_url)}
                  className="w-full"
                />
              ))}
            </div>
            {/* Transcription below the cassette */}
            {audios.map(media => {
              const transcription = (
                media as { transcription?: string | null }
              ).transcription
              return transcription ? (
                <p
                  key={`t-${media.id}`}
                  className="text-xs text-gray-600 italic border-l-2 border-gray-400 pl-2"
                >
                  "{transcription}"
                </p>
              ) : null
            })}
            {message.content && (
              <p className="text-sm text-gray-700">{message.content}</p>
            )}
          </div>
        )
      default:
        // Post-it text card
        return (
          <p className="text-sm text-gray-800 whitespace-pre-wrap break-words font-medium">
            {message.content}
          </p>
        )
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 relative z-10">
      {/* Analysis still running banner */}
      {isAnalysisRunning && (
        <div className="mb-4 p-3 rounded-lg bg-primary/10 flex items-center gap-3">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
          <p className="text-sm">
            The night is being analyzed... badges are on their way 🏅
          </p>
        </div>
      )}

      <h2 className="text-xl font-bold text-center mb-4">
        The night, revealed 🎉
      </h2>

      {/* Golden card: the AI's verdict on the whole night */}
      {partyMeta && (partyMeta.title || partyMeta.quote) && (
        <div className="mb-5 flex justify-center">
          <div className="relative w-full max-w-md rotate-[-1deg] rounded-sm bg-gradient-to-br from-amber-200 via-yellow-200 to-amber-300 p-4 shadow-lg ring-1 ring-amber-400/50 animate-in fade-in zoom-in-95 duration-500">
            {/* Gold tape */}
            <span
              aria-hidden
              className="absolute -top-2.5 left-1/2 h-4 w-14 -translate-x-1/2 rotate-[3deg] rounded-[1px] bg-yellow-100/80 shadow-sm"
            />
            <div className="text-center">
              <span className="text-2xl">🏆</span>
              {partyMeta.title && (
                <p className="font-note mt-1 text-lg font-bold leading-tight text-amber-900">
                  {partyMeta.title}
                </p>
              )}
              {partyMeta.quote && (
                <blockquote className="font-note mt-2 text-sm italic leading-snug text-amber-800">
                  “{partyMeta.quote}”
                  {partyMeta.quoteAuthor && (
                    <footer className="mt-1 text-xs font-semibold not-italic text-amber-700">
                      — {partyMeta.quoteAuthor}, quote of the night
                    </footer>
                  )}
                </blockquote>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Masonry-style staggered grid via CSS columns */}
      <div className="columns-2 md:columns-3 gap-3 [column-fill:_balance]">
        {sortedMessages.slice(0, visibleCount).map(message => {
          const kind = getMessageKind(message)
          const authorData = conversationUserData[message.issuer_id]
          const smiley = authorData?.smiley
          const displayName =
            authorData?.pseudo ||
            usernames[message.issuer_id] ||
            (message.issuer_id === currentUserId ? 'You' : 'Mystery guest')
          const bgColor = pastelColorFromEmoji(smiley)
          const accent = accentColorFromEmoji(smiley)
          const rotation =
            CARD_ROTATIONS[hashString(message.id) % CARD_ROTATIONS.length]
          const badge = partyBadges[message.issuer_id]

          return (
            <button
              key={message.id}
              type="button"
              onClick={() => setSelectedUserId(message.issuer_id)}
              className="w-full text-left break-inside-avoid mb-3 rounded-sm shadow-md p-3 transition-transform hover:scale-[1.02] animate-in fade-in zoom-in-95 duration-300 block"
              style={{
                backgroundColor: bgColor,
                transform: `rotate(${rotation}deg)`,
                borderTop: `4px solid ${accent}`,
              }}
            >
              {/* Author row */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  {smiley && <span className="text-base">{smiley}</span>}
                  <span className="text-xs font-semibold text-gray-700 truncate">
                    {displayName}
                  </span>
                </div>
                {message.timestamp && (
                  <span className="text-[10px] text-gray-500 tabular-nums">
                    {formatTime(message.timestamp)}
                  </span>
                )}
              </div>

              {renderCardContent(message, kind)}

              {/* Badge + wildness earned by the author in this party */}
              {badge && (
                <div className="mt-2 flex items-center justify-between gap-1">
                  <div className="flex min-w-0 items-center gap-1">
                    <span className="text-sm">{badge.emoji}</span>
                    <span className="truncate text-[10px] font-bold text-gray-600 uppercase tracking-wide">
                      {badge.name}
                    </span>
                  </div>
                  {(badge.wildness ?? 0) > 0 && (
                    <span
                      className="flex shrink-0 items-center gap-0.5 rounded-full bg-white/60 px-1.5 py-0.5 text-[10px] font-bold text-red-600 shadow-sm"
                      title="Wildness score"
                    >
                      🌶️ {badge.wildness}%
                    </span>
                  )}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Mini profile bottom drawer */}
      <MiniProfileSheet
        userId={selectedUserId}
        currentUserId={currentUserId}
        displayName={
          selectedUserId
            ? conversationUserData[selectedUserId]?.pseudo ||
              usernames[selectedUserId]
            : undefined
        }
        smiley={
          selectedUserId
            ? conversationUserData[selectedUserId]?.smiley
            : undefined
        }
        onClose={() => setSelectedUserId(null)}
      />
    </div>
  )
}
