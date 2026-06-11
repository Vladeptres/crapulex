import { useState } from 'react'
import type { MessageResponse } from '@/api/generated'
import { getMessageKind, TIMELINE_COLORS } from '@/lib/signature'

interface TimelineStripProps {
  messages: MessageResponse[]
  isLocked: boolean
  onDotClick: (messageId: string) => void
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

/**
 * Fixed vertical timeline strip (~40px) showing a colored dot per message,
 * ordered by time. Tapping the strip expands a wider panel with timestamps.
 * Tapping a dot scrolls the feed to the corresponding message.
 */
export default function TimelineStrip({
  messages,
  isLocked,
  onDotClick,
}: TimelineStripProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  const sortedMessages = [...messages].sort(
    (a, b) =>
      new Date(a.timestamp || 0).getTime() -
      new Date(b.timestamp || 0).getTime()
  )

  return (
    <div
      className={`flex-shrink-0 h-full border-r bg-card/70 backdrop-blur-sm overflow-y-auto overflow-x-hidden transition-all duration-300 relative z-10 ${
        isExpanded ? 'w-28' : 'w-10'
      }`}
      onClick={e => {
        // Expand when tapping the strip background (not a dot)
        if (e.target === e.currentTarget) {
          setIsExpanded(prev => !prev)
        }
      }}
    >
      <div className="flex flex-col items-stretch gap-2 py-3 min-h-full">
        {/* Collapse/expand handle */}
        <button
          type="button"
          onClick={() => setIsExpanded(prev => !prev)}
          className="text-xs text-muted-foreground self-center select-none"
          aria-label={isExpanded ? 'Collapse timeline' : 'Expand timeline'}
        >
          {isExpanded ? '«' : '»'}
        </button>

        {/* Dots, ordered by time */}
        {sortedMessages.map(message => {
          const kind = getMessageKind(message)
          return (
            <button
              key={message.id}
              type="button"
              onClick={() => onDotClick(message.id)}
              className={`flex items-center gap-2 px-2 py-0.5 group ${
                isExpanded ? 'justify-start' : 'justify-center'
              }`}
              title={message.timestamp ? formatTime(message.timestamp) : ''}
            >
              <span
                className="w-3 h-3 rounded-full flex-shrink-0 transition-transform group-hover:scale-150 group-active:scale-125"
                style={{ backgroundColor: TIMELINE_COLORS[kind] }}
              />
              {isExpanded && message.timestamp && (
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  {formatTime(message.timestamp)}
                </span>
              )}
            </button>
          )
        })}

        {/* End-of-timeline indicator */}
        <div className="mt-auto self-center pt-3 pb-1 select-none">
          {isLocked ? (
            <span className="text-lg" title="Party's over!">
              🏁
            </span>
          ) : (
            // Animated dancer while the party is still going
            <span
              className="text-lg inline-block animate-bounce"
              title="Party in progress..."
            >
              🪩
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
