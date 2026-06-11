import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { showToast } from '@/lib/toast'

interface RevealButtonProps {
  conversationId: string
  userId: string
  /** Live counter pushed via WebSocket (overrides fetched state when set) */
  liveReadyCount?: number | null
  liveMemberCount?: number | null
}

/**
 * "Reveal the night 🎉" button shown to all members once the admin locks the
 * conversation. Displays a live "X / Y members ready" counter. The reveal
 * fires for everyone once >= 50% of active members have tapped it.
 */
export default function RevealButton({
  conversationId,
  userId,
  liveReadyCount,
  liveMemberCount,
}: RevealButtonProps) {
  const [readyCount, setReadyCount] = useState(0)
  const [memberCount, setMemberCount] = useState(0)
  const [userIsReady, setUserIsReady] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const apiUrl = import.meta.env.VITE_API_URL || ''

  // Initial status fetch
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await fetch(
          `${apiUrl}/chat/${conversationId}/reveal-status`,
          { headers: { 'User-Id': userId } }
        )
        if (response.ok) {
          const data = await response.json()
          setReadyCount(data.ready_count)
          setMemberCount(data.member_count)
          setUserIsReady(data.user_is_ready)
        }
      } catch (error) {
        console.error('Failed to fetch reveal status:', error)
      }
    }
    fetchStatus()
  }, [apiUrl, conversationId, userId])

  // Live updates via WebSocket
  useEffect(() => {
    if (liveReadyCount != null) setReadyCount(liveReadyCount)
    if (liveMemberCount != null) setMemberCount(liveMemberCount)
  }, [liveReadyCount, liveMemberCount])

  const handleTap = async () => {
    if (userIsReady || isSubmitting) return
    setIsSubmitting(true)
    try {
      const response = await fetch(
        `${apiUrl}/chat/${conversationId}/reveal-ready`,
        {
          method: 'POST',
          headers: { 'User-Id': userId },
        }
      )
      if (response.ok) {
        const data = await response.json()
        setReadyCount(data.ready_count)
        setMemberCount(data.member_count)
        setUserIsReady(true)
      } else {
        throw new Error(`HTTP ${response.status}`)
      }
    } catch (error) {
      console.error('Failed to mark reveal ready:', error)
      showToast.error('Something went wrong', 'Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="border-b bg-gradient-to-r from-purple-500/10 via-pink-500/10 to-orange-500/10 px-4 py-4 relative z-10">
      <Button
        onClick={handleTap}
        disabled={userIsReady || isSubmitting}
        className="w-full h-14 text-lg font-bold gradient-btn text-white shadow-lg"
      >
        {userIsReady ? 'Waiting for the others... 🫶' : 'Reveal the night 🎉'}
      </Button>
      <p className="text-center text-sm text-muted-foreground mt-2 tabular-nums">
        {readyCount} / {memberCount} members ready
      </p>
    </div>
  )
}
