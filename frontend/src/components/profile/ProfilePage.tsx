import { useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'

import type { UserResponse } from '@/api/generated'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { getGravatarUrl, getUserInitials } from '@/lib/gravatar'

interface BadgeInfo {
  emoji: string
  count: number
  level: number
  description?: string
}

interface PartySummary {
  id: string
  name: string
  is_locked: boolean
}

interface ProfileData {
  id: string
  username: string
  pseudo?: string | null
  badges: Record<string, BadgeInfo>
  past_parties: PartySummary[]
  total_messages: number
  parties_attended: number
}

interface ProfilePageProps {
  user: UserResponse
  onBack: () => void
}

/** Next triangular-number threshold for the badge level progress hint. */
const nextLevelThreshold = (level: number) =>
  ((level + 1) * (level + 2)) / 2

export default function ProfilePage({ user, onBack }: ProfilePageProps) {
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchProfile = async () => {
      setIsLoading(true)
      try {
        const apiUrl = import.meta.env.VITE_API_URL || ''
        const response = await fetch(`${apiUrl}/users/${user.id}/profile`, {
          headers: { 'User-Id': user.id },
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
  }, [user.id])

  const badges = profile ? Object.entries(profile.badges) : []

  return (
    <div className="h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center gap-3 p-3 border-b bg-card sticky top-0 z-10">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <h1 className="font-semibold text-lg">My profile</h1>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : (
        <div className="max-w-lg mx-auto p-4 space-y-6">
          {/* Identity */}
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage
                src={getGravatarUrl(user.username, 200)}
                alt={user.username}
              />
              <AvatarFallback className="text-xl">
                {getUserInitials(user.username)}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-xl font-bold">{user.username}</p>
              {profile?.pseudo && (
                <p className="text-sm text-muted-foreground">
                  {profile.pseudo}
                </p>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border p-4 text-center">
              <p className="text-2xl font-bold tabular-nums">
                {profile?.total_messages ?? 0}
              </p>
              <p className="text-xs text-muted-foreground">Messages sent</p>
            </div>
            <div className="rounded-xl border p-4 text-center">
              <p className="text-2xl font-bold tabular-nums">
                {profile?.parties_attended ?? 0}
              </p>
              <p className="text-xs text-muted-foreground">Parties attended</p>
            </div>
          </div>

          {/* Badge collection */}
          <div>
            <h2 className="font-semibold mb-2">Badge collection 🏅</h2>
            {badges.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center border rounded-xl">
                No badges yet — go make some memories! 🎉
              </p>
            ) : (
              <div className="space-y-2">
                {badges.map(([name, badge]) => (
                  <div
                    key={name}
                    className="flex items-center gap-3 p-3 rounded-xl border"
                  >
                    <span className="text-3xl">{badge.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{name}</p>
                      {badge.description && (
                        <p className="text-xs text-muted-foreground">
                          {badge.description}
                        </p>
                      )}
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Earned {badge.count}× · next level at{' '}
                        {nextLevelThreshold(badge.level)}
                      </p>
                    </div>
                    <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-primary/15 text-primary whitespace-nowrap">
                      Lv. {badge.level}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Past parties */}
          <div>
            <h2 className="font-semibold mb-2">Past parties 🪩</h2>
            {!profile || profile.past_parties.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center border rounded-xl">
                No parties yet.
              </p>
            ) : (
              <div className="space-y-2">
                {profile.past_parties.map(party => (
                  <div
                    key={party.id}
                    className="flex items-center justify-between p-3 rounded-xl border"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {party.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        #{party.id}
                      </p>
                    </div>
                    <span className="text-lg">
                      {party.is_locked ? '🏁' : '🎉'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
