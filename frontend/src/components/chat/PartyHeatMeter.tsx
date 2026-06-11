import { useEffect, useState } from 'react'
import type { MessageResponse } from '@/api/generated'

const WINDOW_MS = 15 * 60 * 1000

interface HeatLevel {
  emoji: string
  label: string
  /** Number of the 5 thermometer segments lit */
  bars: number
  barColor: string
  animate?: string
}

const LEVELS: HeatLevel[] = [
  { emoji: '🧊', label: 'Ice cold', bars: 1, barColor: 'bg-sky-300' },
  { emoji: '☁️', label: 'Warming up', bars: 2, barColor: 'bg-amber-300' },
  { emoji: '😎', label: 'Vibing', bars: 3, barColor: 'bg-orange-400' },
  {
    emoji: '🔥',
    label: 'On fire!',
    bars: 4,
    barColor: 'bg-red-500',
    animate: 'animate-pulse',
  },
  {
    emoji: '🌋',
    label: 'ERUPTING',
    bars: 5,
    barColor: 'bg-red-600',
    animate: 'animate-bounce',
  },
]

const levelFromCount = (count: number): HeatLevel => {
  if (count >= 10) return LEVELS[4]
  if (count >= 6) return LEVELS[3]
  if (count >= 3) return LEVELS[2]
  if (count >= 1) return LEVELS[1]
  return LEVELS[0]
}

const parseTimestamp = (timestamp: string): number => {
  const utcTimestamp =
    timestamp.endsWith('Z') || timestamp.includes('+')
      ? timestamp
      : timestamp + 'Z'
  return new Date(utcTimestamp).getTime()
}

/**
 * Live "party heat" thermometer for the chat header: how hot is the night
 * right now, based on notes stuck to the wall in the last 15 minutes.
 * Cools down on its own via a periodic tick.
 */
export default function PartyHeatMeter({
  messages,
}: {
  messages: MessageResponse[]
}) {
  const [now, setNow] = useState(() => Date.now())

  // Tick so the meter cools down even when nobody sends anything
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])

  const recentCount = messages.filter(
    m => m.timestamp && now - parseTimestamp(m.timestamp) < WINDOW_MS
  ).length
  const level = levelFromCount(recentCount)

  return (
    <div
      className="flex items-center gap-1.5 pr-2"
      title={`${recentCount} note${recentCount === 1 ? '' : 's'} in the last 15 min — ${level.label}`}
    >
      <span className={`text-lg leading-none ${level.animate ?? ''}`}>
        {level.emoji}
      </span>
      <div className="hidden flex-col gap-0.5 sm:flex">
        <span className="text-[10px] font-semibold leading-none text-muted-foreground uppercase tracking-wide">
          {level.label}
        </span>
        <div className="flex gap-0.5">
          {Array.from({ length: 5 }, (_, i) => (
            <span
              key={i}
              className={`h-1 w-3 rounded-full transition-colors ${
                i < level.bars ? level.barColor : 'bg-muted'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
