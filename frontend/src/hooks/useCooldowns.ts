import { useCallback, useEffect, useRef, useState } from 'react'

export type CooldownType = 'media' | 'voice' | 'drawing'

export interface CooldownState {
  media: number
  voice: number
  drawing: number
}

const EMPTY_COOLDOWNS: CooldownState = { media: 0, voice: 0, drawing: 0 }

/**
 * Tracks per-type message cooldowns for the current user in a conversation.
 * Fetches the server state and ticks the remaining seconds down locally.
 */
export function useCooldowns(conversationId: string, userId: string) {
  const [cooldowns, setCooldowns] = useState<CooldownState>(EMPTY_COOLDOWNS)
  const [cooldownDuration, setCooldownDuration] = useState(1800)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const refresh = useCallback(async () => {
    try {
      const apiUrl = import.meta.env.VITE_API_URL || ''
      const response = await fetch(
        `${apiUrl}/chat/${conversationId}/cooldowns`,
        {
          headers: { 'User-Id': userId },
        }
      )
      if (response.ok) {
        const data = await response.json()
        setCooldowns({
          media: data.cooldowns?.media ?? 0,
          voice: data.cooldowns?.voice ?? 0,
          drawing: data.cooldowns?.drawing ?? 0,
        })
        if (data.cooldown_duration_seconds) {
          setCooldownDuration(data.cooldown_duration_seconds)
        }
      }
    } catch (error) {
      console.error('Failed to fetch cooldowns:', error)
    }
  }, [conversationId, userId])

  // Initial fetch + refetch on conversation change
  useEffect(() => {
    refresh()
  }, [refresh])

  // Tick down locally every second
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setCooldowns(prev => {
        if (prev.media === 0 && prev.voice === 0 && prev.drawing === 0) {
          return prev
        }
        return {
          media: Math.max(0, prev.media - 1),
          voice: Math.max(0, prev.voice - 1),
          drawing: Math.max(0, prev.drawing - 1),
        }
      })
    }, 1000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  /** Optimistically start a cooldown locally after a successful send. */
  const startCooldown = useCallback(
    (type: CooldownType) => {
      setCooldowns(prev => ({ ...prev, [type]: cooldownDuration }))
    },
    [cooldownDuration]
  )

  return { cooldowns, cooldownDuration, refresh, startCooldown }
}

export function formatCooldown(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}
