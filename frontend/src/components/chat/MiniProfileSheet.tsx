import { useEffect, useState } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { getGravatarUrl, getUserInitials } from '@/lib/gravatar'

interface BadgeInfo {
  emoji: string
  count: number
  level: number
  description?: string
}

interface ProfileData {
  id: string
  username: string
  pseudo?: string | null
  badges: Record<string, BadgeInfo>
  total_messages: number
  parties_attended: number
}

interface MiniProfileSheetProps {
  userId: string | null
  currentUserId: string
  displayName?: string
  smiley?: string
  onClose: () => void
}

/**
 * Bottom drawer showing a user's full badge collection, opened by tapping
 * their card in the reveal view.
 */
export default function MiniProfileSheet({
  userId,
  currentUserId,
  displayName,
  smiley,
  onClose,
}: MiniProfileSheetProps) {
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!userId) {
      setProfile(null)
      return
    }
    const fetchProfile = async () => {
      setIsLoading(true)
      try {
        const apiUrl = import.meta.env.VITE_API_URL || ''
        const response = await fetch(`${apiUrl}/users/${userId}/profile`, {
          headers: { 'User-Id': currentUserId },
        })
        if (response.ok) {
          setProfile(await response.json())
        }
      } catch (error) {
        console.error('Failed to fetch profile:', error)
      } finally {
        setIsLoading(false)
      }
    }
    fetchProfile()
  }, [userId, currentUserId])

  if (!userId) return null

  const badges = profile ? Object.entries(profile.badges) : []

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
        aria-hidden
      />
      {/* Bottom drawer */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t rounded-t-2xl p-5 max-h-[70vh] overflow-y-auto animate-in slide-in-from-bottom duration-300">
        <div className="w-10 h-1 rounded-full bg-muted-foreground/30 mx-auto mb-4" />

        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          {smiley ? (
            <span className="text-3xl">{smiley}</span>
          ) : (
            <Avatar className="h-10 w-10">
              <AvatarImage
                src={getGravatarUrl(profile?.username || userId, 100)}
                alt={profile?.username || userId}
              />
              <AvatarFallback>
                {getUserInitials(profile?.username || userId)}
              </AvatarFallback>
            </Avatar>
          )}
          <div>
            <p className="font-semibold">
              {displayName || profile?.pseudo || profile?.username || userId}
            </p>
            {profile && (
              <p className="text-xs text-muted-foreground">
                {profile.total_messages} messages · {profile.parties_attended}{' '}
                parties
              </p>
            )}
          </div>
        </div>

        {/* Badge collection */}
        {isLoading ? (
          <div className="flex justify-center py-6">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        ) : badges.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No badges earned yet... the night is young 🌙
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-2">
            {badges.map(([name, badge]) => (
              <div
                key={name}
                className="flex items-center gap-3 p-3 rounded-lg bg-muted/50"
              >
                <span className="text-2xl">{badge.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{name}</p>
                  {badge.description && (
                    <p className="text-xs text-muted-foreground truncate">
                      {badge.description}
                    </p>
                  )}
                </div>
                <span className="text-xs font-bold px-2 py-1 rounded-full bg-primary/15 text-primary whitespace-nowrap">
                  Lv. {badge.level}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
