import { useEffect, useState } from 'react'
import type { UserResponse, Conversation } from '@/api/generated'
import {
  apiApiListConversations,
  apiApiGetUsers,
  apiApiPatchConversation,
} from '@/api/generated'
import AppHeader from '@/components/layout/AppHeader'
import { Button } from '@/components/ui/button'
import {
  MessageCircle,
  MessageSquare,
  MessageSquareOff,
  Users,
  Lock,
  Unlock,
  Eye,
  EyeOff,
} from 'lucide-react'
import { showToast } from '@/lib/toast'
import { getGravatarUrl, getUserInitials } from '@/lib/gravatar'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import FunBackground from '@/components/ui/fun-background'
import JoinChatModal from './JoinChatModal'
import NewChatModal from './NewChatModal'

interface WelcomeScreenProps {
  user: UserResponse | null
  onLogin: () => void
  onLogout: () => void
  onJoinChat?: (conversation: Conversation) => void
}

export default function WelcomeScreen({
  user,
  onLogin,
  onLogout,
  onJoinChat,
}: WelcomeScreenProps) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [users, setUsers] = useState<Record<string, UserResponse>>({})

  const fetchUsers = async () => {
    if (!user) return

    try {
      const response = await apiApiGetUsers({
        headers: {
          'User-Id': user.id,
        },
      })

      if (response.data && Array.isArray(response.data)) {
        const usersMap: Record<string, UserResponse> = {}
        response.data.forEach(user => {
          usersMap[user.id] = user
        })
        setUsers(usersMap)
      }
    } catch (error) {
      console.error('Failed to fetch users:', error)
    }
  }

  const fetchConversations = async () => {
    if (!user) return

    setIsLoading(true)
    try {
      const response = await apiApiListConversations({
        headers: {
          'User-Id': user.id,
        },
      })

      if (response.data) {
        setConversations(response.data)
      }
    } catch (error) {
      console.error('Failed to fetch conversations:', error)
      showToast.error(
        'Failed to load conversations',
        'Please try refreshing the page.'
      )
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (user) {
      fetchConversations()
      fetchUsers()
    }
  }, [user])

  const handleUnlockConversation = async (conversation: Conversation) => {
    if (!user) return

    try {
      const newLockState = !conversation.is_locked
      await apiApiPatchConversation({
        path: {
          conversation_id: conversation.id || '',
        },
        body: { is_locked: newLockState },
        headers: {
          'User-Id': user.id,
        },
      })

      if (newLockState) {
        showToast.success(
          'Conversation locked!',
          'No one can send new messages to this conversation.'
        )
      } else {
        showToast.success(
          'Conversation unlocked!',
          'Users can now send messages to this conversation.'
        )
      }
      fetchConversations()
    } catch (error) {
      console.error('Failed to update conversation lock state:', error)
      showToast.error(
        'Failed to update conversation',
        'Please try again or refresh the page.'
      )
    }
  }

  const handleToggleVisibility = async (conversation: Conversation) => {
    if (!user) return

    try {
      const newVisibilityState = !conversation.is_visible
      await apiApiPatchConversation({
        path: {
          conversation_id: conversation.id || '',
        },
        body: { is_visible: newVisibilityState },
        headers: {
          'User-Id': user.id,
        },
      })

      if (newVisibilityState) {
        showToast.success(
          'Conversation revealed!',
          'Messages are now visible to all users.'
        )
      } else {
        showToast.success(
          'Conversation hidden!',
          'Messages are now blurred for privacy.'
        )
      }
      fetchConversations()
    } catch (error) {
      console.error('Failed to update conversation visibility:', error)
      showToast.error(
        'Failed to update conversation',
        'Please try again or refresh the page.'
      )
    }
  }

  const renderUserAvatars = (userIds: string[] | undefined) => {
    if (!userIds || userIds.length === 0) {
      return (
        <div className="items-center gap-1 text-muted-foreground invisible md:visible">
          <Users className="h-4 w-4" />
          <span className="text-sm">0 members</span>
        </div>
      )
    }

    const maxAvatars = 5
    const displayUsers = userIds.slice(0, maxAvatars)
    const hasMoreUsers = userIds.length > maxAvatars

    return (
      <div className="flex items-center gap-1 invisible md:visible">
        <div className="flex -space-x-2">
          {displayUsers.map(userId => {
            const user = users[userId]
            return (
              user && (
                <Avatar
                  key={userId}
                  className="h-6 w-6 border-2 border-background"
                  title={user.username}
                >
                  <AvatarImage
                    src={getGravatarUrl(user.username, 100)}
                    alt={user.username}
                  />
                  <AvatarFallback className="text-xs">
                    {getUserInitials(user.username)}
                  </AvatarFallback>
                </Avatar>
              )
            )
          })}
        </div>
        {hasMoreUsers && (
          <span className="text-sm text-muted-foreground ml-1">
            +{userIds.length - maxAvatars}
          </span>
        )}
      </div>
    )
  }

  if (user) {
    return (
      <div className="flex flex-col h-full">
        {/* App Header */}
        <AppHeader user={user} onLogout={onLogout} />

        {/* Conversation List Section */}
        <div className="flex-1 overflow-hidden relative">
          <div className="w-full flex flex-col h-full">
            <div className="flex items-center justify-between px-6 pt-6 mb-6">
              <h2 className="text-2xl font-bold">Your Conversations</h2>
            </div>

            {isLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                <p className="text-muted-foreground">
                  Loading conversations...
                </p>
              </div>
            ) : conversations.length === 0 ? (
              <div className="flex flex-col justify-center items-center h-full relative overflow-hidden">
                <FunBackground />
                <div className="relative z-10 text-center">
                  <MessageCircle className="h-16 w-16 text-muted-foreground mx-auto mb-4 opacity-50" />
                  <h3 className="text-lg font-semibold mb-2">
                    No conversations yet
                  </h3>
                  <p className="text-muted-foreground mb-6">
                    Create or join one before you're too wasted! 🤪
                  </p>
                  <div className="flex gap-4 justify-center">
                    <NewChatModal
                      user={user}
                      onJoinChat={onJoinChat}
                      onConversationCreated={fetchConversations}
                    />
                    {onJoinChat && (
                      <JoinChatModal
                        user={user}
                        onJoinChat={onJoinChat}
                        onConversationJoined={fetchConversations}
                      />
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-0 border-y overflow-hidden bg-card">
                {conversations.map((conversation, index) => (
                  <div
                    key={conversation.id}
                    className="cursor-pointer hover:bg-muted/50 transition-colors duration-200 backdrop-blur-lg"
                    onClick={() => onJoinChat?.(conversation)}
                  >
                    <div className="px-6 py-3">
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-4">
                              {!conversation.is_visible ? (
                                <MessageSquareOff className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                              )}
                              <h3 className="font-semibold truncate">
                                {conversation.name || 'Unnamed Chat'}
                              </h3>
                            </div>
                            {renderUserAvatars(conversation.users_ids)}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {/* Visibility toggle button - only show for conversation creator */}
                          {conversation.users_ids &&
                            conversation.users_ids.length > 0 &&
                            conversation.users_ids[0] === user.id && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={e => {
                                  e.stopPropagation()
                                  handleToggleVisibility(conversation)
                                }}
                                className="h-6 w-6 p-0"
                                title={
                                  conversation.is_visible
                                    ? 'Hide conversation'
                                    : 'Reveal conversation'
                                }
                              >
                                {conversation.is_visible ? (
                                  <EyeOff className="h-3 w-3" />
                                ) : (
                                  <Eye className="h-3 w-3" />
                                )}
                              </Button>
                            )}
                          {/* Lock/Unlock button - only show for conversation creator */}
                          {conversation.users_ids &&
                            conversation.users_ids.length > 0 &&
                            conversation.users_ids[0] === user.id && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={e => {
                                  e.stopPropagation()
                                  handleUnlockConversation(conversation)
                                }}
                                className="h-6 w-6 p-0"
                                title={
                                  conversation.is_locked
                                    ? 'Unlock conversation'
                                    : 'Lock conversation'
                                }
                              >
                                {conversation.is_locked ? (
                                  <Unlock className="h-3 w-3" />
                                ) : (
                                  <Lock className="h-3 w-3" />
                                )}
                              </Button>
                            )}
                          <span className="font-mono text-xs text-muted-foreground">
                            #{conversation.id}
                          </span>
                        </div>
                      </div>
                    </div>
                    {index < conversations.length - 1 && (
                      <div className="border-t border-border mx-6" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Fun background below conversation list */}
          {conversations.length > 0 && (
            <div className="absolute bottom-0 left-0 right-0 h-full pointer-events-none">
              <FunBackground />
            </div>
          )}
        </div>

        {/* Action Buttons Section - Only show when there are conversations */}
        {conversations.length > 0 && (
          <div className="px-6 py-3 pb-6 border-t bg-card flex gap-3 justify-center">
            <NewChatModal
              user={user}
              onJoinChat={onJoinChat}
              onConversationCreated={fetchConversations}
            />
            {onJoinChat && (
              <JoinChatModal
                user={user}
                onJoinChat={onJoinChat}
                onConversationJoined={fetchConversations}
              />
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex min-h-full flex-col items-center justify-center p-6">
      <div className="text-center space-y-4">
        <h2 className="text-2xl font-bold">Welcome to Bourracho</h2>
        <p className="text-muted-foreground">Please log in to start chatting</p>
        <Button onClick={onLogin}>Login</Button>
      </div>
    </div>
  )
}
