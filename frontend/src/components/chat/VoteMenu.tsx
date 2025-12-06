import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { getGravatarUrl, getUserInitials } from '@/lib/gravatar'
import { showToast } from '@/lib/toast'
import type {
  UserResponse,
  ConversationResponse,
  MessageResponse,
} from '@/api/generated'

interface VoteMenuProps {
  message: MessageResponse
  conversation: ConversationResponse
  currentUser: UserResponse
  users: Record<string, UserResponse>
  conversationUserData: Record<string, { pseudo?: string; smiley?: string }>
  onVote: (messageId: string, votedForUserId: string) => Promise<void>
  className?: string
}

export default function VoteMenu({
  message,
  conversation,
  currentUser,
  users,
  conversationUserData,
  onVote,
  className = '',
}: VoteMenuProps) {
  const [isVoting, setIsVoting] = useState(false)

  // Check if conversation is locked (voting only allowed when locked)
  if (!conversation.is_locked) {
    return null
  }

  // Get current user's vote for this message
  const currentUserVote = message.votes?.[currentUser.id]

  // Get all users in the conversation
  const conversationUsers = Object.keys(conversation.users)
    .map(userId => ({
      userId,
      user: users[userId],
      userData: conversationUserData[userId],
    }))
    .filter(({ user }) => user) // Only include users we have data for

  const handleVote = async (votedForUserId: string) => {
    if (isVoting) return

    setIsVoting(true)
    try {
      await onVote(message.id, votedForUserId)
      showToast.success(
        'Vote cast!',
        `You voted for ${users[votedForUserId]?.username || 'this user'}`
      )
    } catch (error) {
      console.error('Failed to vote:', error)
      showToast.error('Failed to vote', 'Please try again.')
    } finally {
      setIsVoting(false)
    }
  }

  // Get vote counts for each user
  const voteCounts = conversationUsers.reduce(
    (acc, { userId }) => {
      acc[userId] = Object.values(message.votes || {}).filter(
        vote => vote === userId
      ).length
      return acc
    },
    {} as Record<string, number>
  )

  return (
    <div className={`bg-card border rounded-lg p-3 shadow-lg ${className}`}>
      <div className="text-xs font-medium text-muted-foreground mb-2">
        Who does this message belong to?
      </div>

      <div className="grid grid-cols-2 gap-2">
        {conversationUsers.map(({ userId, user, userData }) => {
          const isSelected = currentUserVote === userId
          const voteCount = voteCounts[userId] || 0

          return (
            <Button
              key={userId}
              variant={isSelected ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleVote(userId)}
              disabled={isVoting}
              className={`flex items-center gap-2 p-2 h-auto justify-start ${
                isSelected ? 'ring-2 ring-primary' : ''
              }`}
            >
              {/* User Avatar/Emoji */}
              <div className="flex-shrink-0">
                {userData?.smiley ? (
                  <span className="text-lg leading-none">
                    {userData.smiley}
                  </span>
                ) : (
                  <Avatar className="h-6 w-6">
                    <AvatarImage
                      src={getGravatarUrl(user.username, 100)}
                      alt={user.username}
                    />
                    <AvatarFallback className="text-xs">
                      {getUserInitials(user.username)}
                    </AvatarFallback>
                  </Avatar>
                )}
              </div>

              {/* User Name/Pseudo */}
              <div className="flex-1 text-left">
                <div className="text-xs font-medium truncate">
                  {userData?.pseudo || user.username}
                </div>
                {voteCount > 0 && (
                  <div className="text-xs text-muted-foreground">
                    {voteCount} vote{voteCount !== 1 ? 's' : ''}
                  </div>
                )}
              </div>

              {/* Vote indicator */}
              {isSelected && <div className="text-xs text-primary">✓</div>}
            </Button>
          )
        })}
      </div>

      {currentUserVote && (
        <div className="text-xs text-muted-foreground mt-2 text-center">
          You voted for {users[currentUserVote]?.username || 'this user'}
        </div>
      )}
    </div>
  )
}
