import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Send, ArrowLeft, Copy, Check, ChevronDown } from 'lucide-react'
import { showToast } from '@/lib/toast'
import type {
  UserResponse,
  ConversationResponse,
  MessagePost,
  MessageResponse,
  MessageUpdate,
  ReactPost,
} from '@/api/generated'
import {
  apiApiGetMessages,
  apiApiGetUsers,
  apiApiPatchMessage,
  apiApiGetConversationUsers,
} from '@/api/generated'
import { getGravatarUrl, getUserInitials } from '@/lib/gravatar'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import FunBackground from '@/components/ui/fun-background'
import UserManagementModal from './UserManagementModal'
import AudioRecorder from './AudioRecorder'
import AudioPlayer from './AudioPlayer'
import PhotoUploader from './PhotoUploader'
import PhotoDisplay from './PhotoDisplay'
import VoteMenu from './VoteMenu'
import ConversationAnalysisModal from './ConversationAnalysisModal'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useWebSocket } from '@/hooks/useWebSocket'

interface ChatPageProps {
  conversation: ConversationResponse
  user: UserResponse
  onSendMessage?: (message: string) => void
  onBackToHome: () => void
  messages?: MessageResponse[]
  autoScroll?: boolean
  onConversationUpdate?: (updatedConversation: ConversationResponse) => void
}

export default function ChatPage({
  conversation: initialConversation,
  user,
  onSendMessage,
  onBackToHome,
  messages: initialMessages = [],
  autoScroll = true,
  onConversationUpdate,
}: ChatPageProps) {
  const [conversation, setConversation] =
    useState<ConversationResponse>(initialConversation)
  const [messageInput, setMessageInput] = useState('')
  const [copied, setCopied] = useState(false)
  const [messages, setMessages] = useState<MessageResponse[]>(initialMessages)
  const [isLoading, setIsLoading] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [users, setUsers] = useState<Record<string, UserResponse>>({})
  const [conversationUserData, setConversationUserData] = useState<
    Record<string, { pseudo?: string; smiley?: string }>
  >({})
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const [showScrollButton, setShowScrollButton] = useState(false)
  const [wasAtBottom, setWasAtBottom] = useState(true)
  const [showVoteMenu, setShowVoteMenu] = useState<string | null>(null) // messageId or null
  const [showAnalysisModal, setShowAnalysisModal] = useState(false)
  const [shouldShowAnalysisButton, setShouldShowAnalysisButton] = useState(false)

  // WebSocket connection for real-time updates
  useWebSocket(`${import.meta.env.VITE_API_URL}/ws/chat/${conversation.id}/`, {
    onMessage: message => {
      // Debug: Check if this is a raw message without type wrapper
      if (!message.type && message.id && message.content) {
        const newMessage = message as unknown as MessageResponse
        setMessages(prev => {
          const messageExists = prev.some(m => m.id === newMessage.id)
          if (messageExists) {
            return prev
          }
          return [...prev, newMessage]
        })
        return
      }

      if (message.type === 'conversation_name_changed') {
        // Update conversation name in real-time
        setConversation(prev => ({
          ...prev,
          name: message.new_name,
        }))

        // Show toast notification only if the change was made by another user
        if (message.changed_by && message.changed_by !== user.id) {
          showToast.info(`Conversation renamed to "${message.new_name}"`)
        }
      } else if (message.type === 'user_data_changed') {
        // Handle user data changes (pseudo/smiley)
        if (message.changed_by && message.changed_by !== user.id) {
          const changedUser = users[message.user_id]
          const userName = changedUser?.username || 'A user'

          if (message.pseudo !== undefined) {
            const pseudoText = message.pseudo
              ? `"${message.pseudo}"`
              : 'removed their nickname'
            showToast.info(
              `${userName} ${message.pseudo ? 'set nickname to' : ''} ${pseudoText}`
            )
          }

          if (message.smiley !== undefined) {
            const smileyText = message.smiley
              ? message.smiley
              : 'removed their emoji'
            showToast.info(
              `${userName} ${message.smiley ? 'changed emoji to' : ''} ${smileyText}`
            )
          }
        }

        // Refresh user data to show changes in chat
        fetchConversationUserData()

        // Trigger a custom event to notify UserManagementModal to refresh (only if modal is open)
        window.dispatchEvent(
          new CustomEvent('userDataChanged', {
            detail: {
              conversationId: message.conversation_id,
              userId: message.user_id,
              pseudo: message.pseudo,
              smiley: message.smiley,
            },
          })
        )
      } else if (message.type === 'user_joined') {
        // Handle user join events
        const joinedUser = users[message.user_id]
        const userName = joinedUser?.username || 'A user'

        if (message.user_id !== user.id) {
          showToast.info(`${userName} joined the conversation`)
        }
      } else if (message.type === 'chat_message') {
        // Handle new message via WebSocket
        const newMessage = message.message as MessageResponse
        setMessages(prev => {
          // Check if message already exists to avoid duplicates
          const messageExists = prev.some(m => m.id === newMessage.id)
          if (messageExists) {
            return prev
          }
          return [...prev, newMessage]
        })
      } else if (message.type === 'conversation_lock_changed') {
        // Simple lock state update - only update if different
        setConversation(prev => {
          if (prev.is_locked === message.is_locked) {
            console.log('🔒 Lock state unchanged:', message.is_locked)
            return prev // No change needed
          }
          console.log(
            '🔒 Updating lock state from',
            prev.is_locked,
            'to',
            message.is_locked
          )
          const updated = {
            ...prev,
            is_locked: message.is_locked,
          }
          console.log('🔒 Updated conversation:', updated)
          return updated
        })

        // Show toast notification only if the change was made by another user
        if (message.changed_by && message.changed_by !== user.id) {
          const lockMessage = message.is_locked
            ? 'Conversation has been locked'
            : 'Conversation has been unlocked'
          showToast.info(lockMessage)
        }

        // Show analysis button when conversation is locked
        if (message.is_locked) {
          setShouldShowAnalysisButton(true)
        } else {
          setShouldShowAnalysisButton(false)
          setShowAnalysisModal(false)
        }
      } else if (message.type === 'conversation_visibility_changed') {
        // Handle conversation visibility state changes
        setConversation(prev => ({
          ...prev,
          is_visible: message.is_visible,
        }))

        // Show toast notification only if the change was made by another user
        if (message.changed_by && message.changed_by !== user.id) {
          const visibilityMessage = message.is_visible
            ? 'Conversation is now visible'
            : 'Conversation has been hidden'
          showToast.info(visibilityMessage)
        }
      } else if (message.type === 'message_reaction_updated') {
        // Handle message reaction updates in real-time
        const updatedMessage = message.message as MessageResponse
        setMessages(prev =>
          prev.map(msg =>
            msg.id === message.message_id ? updatedMessage : msg
          )
        )
      } else if (message.type === 'message_vote_updated') {
        // Handle message vote updates in real-time
        const updatedMessage = message.message as MessageResponse
        setMessages(prev =>
          prev.map(msg =>
            msg.id === message.message_id ? updatedMessage : msg
          )
        )

        // Show toast notification only if the change was made by another user
        if (message.changed_by && message.changed_by !== user.id) {
          showToast.info('Vote updated', 'Someone voted on a message')
        }
      }

      // Trigger global conversation update for home page for all changes
      if (
        [
          'conversation_name_changed',
          'user_data_changed',
          'user_joined',
          'conversation_lock_changed',
          'conversation_visibility_changed',
        ].includes(message.type)
      ) {
        window.dispatchEvent(
          new CustomEvent('conversationUpdated', {
            detail: { conversationId: message.conversation_id },
          })
        )
      }
    },
    onConnect: () => {
      // WebSocket connected - no action needed
    },
    onDisconnect: () => {
      // WebSocket disconnected - no action needed
    },
    onError: error => {
      console.error('WebSocket error:', error)
    },
  })

  // Update parent component when conversation changes
  useEffect(() => {
    onConversationUpdate?.(conversation)
  }, [conversation, onConversationUpdate])

  // Check initial lock state to show analysis button
  useEffect(() => {
    setShouldShowAnalysisButton(conversation.is_locked)
  }, [conversation.is_locked])

  // Debug: Log input field state changes
  useEffect(() => {
    console.log('🎯 Input field state:', {
      isLocked: conversation.is_locked,
      isSending,
      shouldBeDisabled: isSending || conversation.is_locked,
      conversationId: conversation.id,
    })
  }, [conversation.is_locked, isSending, conversation.id])

  const scrollToBottom = () => {
    if (autoScroll && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }

  const handleScroll = () => {
    if (messagesContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } =
        messagesContainerRef.current
      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 10
      setWasAtBottom(isAtBottom)
      setShowScrollButton(!isAtBottom && !autoScroll)
    }
  }

  // Scroll to bottom when messages change, but only if user was at bottom
  useEffect(() => {
    if (wasAtBottom) {
      scrollToBottom()
    }
  }, [messages, autoScroll, wasAtBottom])

  // Fetch initial data when component mounts
  useEffect(() => {
    fetchMessages()
    fetchUsers()
    fetchConversationUserData()
  }, [conversation.id])

  const fetchMessages = async () => {
    setIsLoading(true)

    try {
      const response = await apiApiGetMessages({
        path: {
          conversation_id: conversation.id || '',
        },
        headers: {
          'User-Id': user.id,
        },
      })

      if (response.data && Array.isArray(response.data)) {
        setMessages(response.data)
      }
    } catch (error) {
      console.error('Failed to fetch messages:', error)
      showToast.error(
        'Failed to load messages',
        'Please try refreshing the page.'
      )
    } finally {
      setIsLoading(false)
    }
  }

  const fetchUsers = async () => {
    try {
      const response = await apiApiGetUsers({
        headers: {
          'User-Id': user.id,
        },
      })

      if (response.data && Array.isArray(response.data)) {
        const usersMap = response.data.reduce(
          (acc, u) => {
            acc[u.id] = u
            return acc
          },
          {} as Record<string, UserResponse>
        )
        setUsers(usersMap)
      }
    } catch (error) {
      console.error('Failed to fetch users:', error)
    }
  }

  const fetchConversationUserData = async () => {
    try {
      const response = await apiApiGetConversationUsers({
        path: { conversation_id: conversation.id },
        headers: {
          'User-Id': user.id,
        },
      })

      if (response.data && Array.isArray(response.data)) {
        const userDataMap = response.data.reduce(
          (acc, userData) => {
            acc[userData.user_id] = {
              pseudo: userData.pseudo || undefined,
              smiley: userData.smiley || undefined,
            }
            return acc
          },
          {} as Record<string, { pseudo?: string; smiley?: string }>
        )
        setConversationUserData(userDataMap)
      }
    } catch (error) {
      console.error('Failed to fetch conversation user data:', error)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await sendMessage()
  }

  const sendMessage = async (audioBlob?: Blob, photoFile?: File) => {
    if ((messageInput.trim() || audioBlob || photoFile) && !isSending) {
      setIsSending(true)
      try {
        const messageData: MessagePost = {
          content: audioBlob || photoFile ? '' : messageInput.trim(),
          conversation_id: conversation.id || '',
          issuer_id: user.id,
        }

        // Prepare form data for file upload if media is provided
        const formData = new FormData()
        formData.append('message', JSON.stringify(messageData))

        if (audioBlob) {
          // Create a file from the blob with proper extension
          const audioFile = new File([audioBlob], `audio_${Date.now()}.webm`, {
            type: audioBlob.type || 'audio/webm',
          })
          formData.append('medias', audioFile)
        }

        if (photoFile) {
          formData.append('medias', photoFile)
        }

        const apiUrl = import.meta.env.VITE_API_URL || ''
        const response = await fetch(
          `${apiUrl}/chat/${conversation.id}/messages/`,
          {
            method: 'POST',
            headers: {
              'User-Id': user.id,
            },
            body: formData,
          }
        )

        if (response.ok) {
          // Message will be added via WebSocket, just clear input
          setMessageInput('')

          // Show success toast for locked conversations or audio messages
          if (conversation.is_locked || audioBlob) {
            showToast.success(
              audioBlob ? 'Audio message sent!' : 'Message sent!',
              audioBlob
                ? 'Your voice message has been delivered.'
                : 'Thanks for this message of great value.'
            )
          }

          // Call the optional callback
          if (onSendMessage) {
            onSendMessage(audioBlob ? '[Audio Message]' : messageInput.trim())
          }
        } else {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }
      } catch (error) {
        console.error('Failed to send message:', error)
        showToast.error(
          audioBlob ? 'Failed to send audio message' : 'Failed to send message',
          'Please try again.'
        )
      } finally {
        setIsSending(false)
      }
    }
  }

  const handleSendAudio = async (audioBlob: Blob) => {
    await sendMessage(audioBlob)
  }

  const handleSendPhoto = async (photoFile: File) => {
    await sendMessage(undefined, photoFile)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const groupMessages = (messages: MessageResponse[]) => {
    const groups: Array<{
      userId: string
      messages: MessageResponse[]
      timestamp: string
    }> = []

    messages.forEach(message => {
      const lastGroup = groups[groups.length - 1]

      if (
        lastGroup &&
        lastGroup.userId === message.issuer_id &&
        message.timestamp &&
        lastGroup.timestamp
      ) {
        const timeDiff =
          new Date(message.timestamp).getTime() -
          new Date(lastGroup.timestamp).getTime()
        if (timeDiff <= 30000) {
          // 30 seconds
          // Add to existing group
          lastGroup.messages.push(message)
          lastGroup.timestamp = message.timestamp
        } else {
          // Start new group
          groups.push({
            userId: message.issuer_id,
            messages: [message],
            timestamp: message.timestamp || '',
          })
        }
      } else {
        // Start new group
        groups.push({
          userId: message.issuer_id,
          messages: [message],
          timestamp: message.timestamp || '',
        })
      }
    })

    return groups
  }

  const copyConversationId = async () => {
    try {
      // Use current origin for the join link
      const baseUrl = window.location.origin
      const link = `${baseUrl}/join/${conversation.id}`
      await navigator.clipboard.writeText(link)
      setCopied(true)
      showToast.success(
        'Conversation link copied!',
        'Share it with others to join.'
      )
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error(error)
      showToast.error(
        'Failed to copy to clipboard',
        'Please copy the link manually.'
      )
    }
  }

  const handleReaction = async (messageId: string, emoji: string) => {
    if (conversation.is_locked) {
      showToast.error('Cannot react', 'Conversation is locked.')
      return
    }

    try {
      const reactPost: ReactPost = {
        emoji,
        issuer_id: user.id,
      }

      const messageUpdate: MessageUpdate = {
        id: messageId,
        reacts: [reactPost],
      }

      const response = await apiApiPatchMessage({
        path: {
          conversation_id: conversation.id || '',
        },
        body: messageUpdate,
        headers: {
          'User-Id': user.id,
        },
      })

      if (response.data) {
        // Update the message in the local state
        setMessages(prev =>
          prev.map(msg => (msg.id === messageId ? response.data : msg))
        )
      }
    } catch (error) {
      console.error('Failed to add reaction:', error)
      showToast.error('Failed to add reaction', 'Please try again.')
    }
  }

  const getReactionCount = (message: MessageResponse, emoji: string) => {
    return message.reacts?.filter(react => react.emoji === emoji).length || 0
  }

  const hasUserReacted = (message: MessageResponse, emoji: string) => {
    return (
      message.reacts?.some(
        react => react.emoji === emoji && react.issuer_id === user.id
      ) || false
    )
  }

  const handleVote = async (messageId: string, votedForUserId: string) => {
    try {
      const messageUpdate: MessageUpdate = {
        id: messageId,
        votes: { [user.id]: votedForUserId },
      }

      const response = await apiApiPatchMessage({
        path: {
          conversation_id: conversation.id || '',
        },
        body: messageUpdate,
        headers: {
          'User-Id': user.id,
        },
      })

      if (response.data) {
        // Update the message in the local state
        setMessages(prev =>
          prev.map(msg => (msg.id === messageId ? response.data : msg))
        )
      }
    } catch (error) {
      console.error('Failed to vote:', error)
      throw error // Re-throw to let VoteMenu handle the error display
    }
  }

  return (
    <div className="flex flex-col h-full relative">
      {/* Fun Background - only show when conversation is visible */}
      {conversation.is_visible && (
        <div className="absolute inset-0 pointer-events-none">
          <FunBackground />
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between p-2 border-b bg-card relative z-10">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onBackToHome}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div className="flex items-center gap-2">
            <div className="flex items-baseline gap-2">
              <UserManagementModal
                conversation={conversation}
                currentUser={user}
                onConversationUpdate={updatedConversation => {
                  setConversation(updatedConversation)
                  if (onConversationUpdate) {
                    onConversationUpdate(updatedConversation)
                  }
                }}
                trigger={
                  <Button
                    variant="ghost"
                    className="p-0 h-auto font-semibold text-xl hover:text-primary transition-colors"
                  >
                    {conversation.name}
                  </Button>
                }
              />
              <p className="text-sm text-muted-foreground">
                (#{conversation.id})
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={copyConversationId}
              className="h-6 w-6 p-0"
            >
              {copied ? (
                <Check className="h-3 w-3" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Analysis Button - show when conversation is locked */}
      {(conversation.is_locked || shouldShowAnalysisButton) && (
        <div className="bg-primary/10 border-b px-4 py-3 relative z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-primary">
              <span className="text-lg">✨</span>
              <div>
                <p className="font-medium text-sm">Night Analysis Available</p>
                <p className="text-xs text-muted-foreground">
                  The conversation has been analyzed. View highlights and summary.
                </p>
              </div>
            </div>
            <Button
              onClick={() => setShowAnalysisModal(true)}
              variant="outline"
              size="sm"
              className="bg-background hover:bg-muted"
            >
              View Analysis
            </Button>
          </div>
        </div>
      )}

      {/* Locked Conversation Header */}
      {!conversation.is_locked && !conversation.is_visible && (
        <div className="bg-muted/50 border-b px-4 py-3 relative z-10">
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="text-lg">🎉</span>
            <div>
              <p className="font-medium text-sm">Party time!</p>
              <p className="text-xs text-muted-foreground">
                Share your ideas while the party's still going on. But don't
                take too long, people want to make memories during the party
                too!
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Messages Area */}
      <div
        className="flex-1 overflow-y-auto pl-2 pr-4 pt-4 pb-4 space-y-4 min-h-0 relative z-10"
        onScroll={handleScroll}
        ref={messagesContainerRef}
      >
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto mb-2"></div>
              <p>Loading messages...</p>
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <p className="text-lg">Welcome to the party! 🎉</p>
              <p className="text-sm">
                Start the conversation by sending a message below.
              </p>
            </div>
          </div>
        ) : (
          groupMessages(messages || []).map((group, groupIndex) => (
            <div
              key={`${group.userId}-${group.timestamp}`}
              className={`group flex ${group.userId === user.id ? 'justify-end' : 'justify-start'} ${groupIndex > 0 ? 'mt-4' : ''}`}
            >
              <div
                className={`flex items-end gap-2 ${group.userId === user.id ? 'flex-row-reverse' : 'flex-row'}`}
              >
                {/* Avatar or Smiley - only show on the last message of the group */}
                {
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div
                          className={`h-6 w-6 flex-shrink-0 cursor-pointer hover:ring-2 hover:ring-primary/20 transition-all rounded-full flex items-center justify-center ${!conversation.is_visible ? 'blur-xs' : ''}`}
                        >
                          {conversationUserData[group.userId]?.smiley ? (
                            <span className="text-lg leading-none">
                              {conversationUserData[group.userId].smiley}
                            </span>
                          ) : (
                            <Avatar className="h-6 w-6">
                              <AvatarImage
                                src={getGravatarUrl(
                                  users[group.userId]?.username || group.userId,
                                  100
                                )}
                                alt={
                                  users[group.userId]?.username || group.userId
                                }
                              />
                              <AvatarFallback className="text-xs">
                                {getUserInitials(
                                  users[group.userId]?.username || group.userId
                                )}
                              </AvatarFallback>
                            </Avatar>
                          )}
                        </div>
                      </TooltipTrigger>
                      {conversationUserData[group.userId]?.pseudo && (
                        <TooltipContent side="top" className="max-w-xs">
                          <p className="font-medium">
                            {conversationUserData[group.userId]?.pseudo}
                          </p>
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                }

                {/* Message Group Content */}
                <div className="flex flex-col gap-1">
                  {group.messages.map(message => (
                    <div
                      key={message.id}
                      className={`flex flex-col ${group.userId === user.id ? 'items-end' : 'items-start'}`}
                    >
                      {/* Vote Menu - above message content when conversation is locked */}
                      {showVoteMenu === message.id &&
                        conversation.is_locked && (
                          <div
                            className={`mb-2 ${group.userId === user.id ? 'flex justify-end' : 'flex justify-start'}`}
                          >
                            <VoteMenu
                              message={message}
                              conversation={conversation}
                              currentUser={user}
                              users={users}
                              conversationUserData={conversationUserData}
                              onVote={handleVote}
                              className="max-w-xs"
                            />
                          </div>
                        )}

                      {/* Vote Button - only show when conversation is locked */}
                      {conversation.is_locked && (
                        <div
                          className={`flex gap-1 mb-1 ${group.userId === user.id ? 'justify-end' : 'justify-start'}`}
                        >
                          <button
                            onClick={() =>
                              setShowVoteMenu(
                                showVoteMenu === message.id ? null : message.id
                              )
                            }
                            className="opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity px-2 py-1 rounded-full hover:bg-muted text-xs font-medium"
                          >
                            🗳️ Vote
                          </button>
                        </div>
                      )}

                      <div
                        className={`rounded-lg px-4 py-2 ${
                          group.userId === user.id
                            ? 'gradient-btn text-white'
                            : 'bg-muted'
                        } ${!conversation.is_visible ? 'blur-xs' : ''}`}
                      >
                        {/* Media messages */}
                        {message.medias_metadatas &&
                        message.medias_metadatas.length > 0 ? (
                          <div className="space-y-2">
                            {/* Photo messages */}
                            {(message.medias_metadatas || [])
                              .filter(media => media.type === 'image')
                              .map(imageMedia => (
                                <PhotoDisplay
                                  key={imageMedia.id}
                                  src={imageMedia.presigned_url}
                                  alt="Shared photo"
                                  className="max-w-sm"
                                />
                              ))}

                            {/* Audio messages */}
                            {(message.medias_metadatas || [])
                              .filter(media => media.type === 'audio')
                              .map(audioMedia => (
                                <AudioPlayer
                                  key={audioMedia.id}
                                  audioUrl={audioMedia.presigned_url}
                                  className="max-w-xs"
                                />
                              ))}

                            {message.content && (
                              <p className="text-sm break-words whitespace-pre-wrap mt-2">
                                {message.content}
                              </p>
                            )}
                            {message.timestamp && (
                              <span className="text-xs opacity-30 block mt-2">
                                {formatTime(message.timestamp)}
                              </span>
                            )}
                          </div>
                        ) : (
                          /* Text messages */
                          <div className="flex items-baseline gap-8 min-w-0">
                            <p className="text-sm break-words whitespace-pre-wrap">
                              {message.content}
                            </p>
                            {message.timestamp && (
                              <span className="text-xs opacity-30 flex-shrink-0">
                                {formatTime(message.timestamp)}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Reactions */}
                      {message.reacts && message.reacts.length > 0 && (
                        <div
                          className={`flex flex-wrap gap-1 mt-1 ${group.userId === user.id ? 'justify-end' : 'justify-start'}`}
                        >
                          {Array.from(
                            new Set((message.reacts || []).map(r => r.emoji))
                          ).map(emoji => {
                            const count = getReactionCount(message, emoji)
                            const userReacted = hasUserReacted(message, emoji)
                            return (
                              <button
                                key={emoji}
                                onClick={() =>
                                  handleReaction(message.id, emoji)
                                }
                                disabled={conversation.is_locked}
                                className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs transition-colors ${
                                  userReacted
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-muted hover:bg-muted/80'
                                } ${conversation.is_locked ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                              >
                                <span>{emoji}</span>
                                <span>{count}</span>
                              </button>
                            )
                          })}
                        </div>
                      )}

                      {/* Add Reaction Buttons - only show on hover */}
                      <div
                        className={`flex gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity ${group.userId === user.id ? 'justify-end' : 'justify-start'}`}
                      >
                        {['👍', '❤️', '😂', '😮', '😢', '😡'].map(emoji => (
                          <button
                            key={emoji}
                            onClick={() => handleReaction(message.id, emoji)}
                            disabled={conversation.is_locked}
                            className={`p-1 rounded-full text-sm transition-colors ${
                              conversation.is_locked
                                ? 'cursor-not-allowed opacity-50 hover:bg-transparent'
                                : 'hover:bg-muted cursor-pointer'
                            }`}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />

        {/* Scroll to bottom button */}
        {showScrollButton && (
          <Button
            onClick={scrollToBottom}
            size="sm"
            className="absolute bottom-4 right-4 rounded-full w-10 h-10 p-0 shadow-lg"
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Message Input */}
      <div className="border-t bg-card p-4 relative z-10">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Textarea
            value={messageInput}
            onChange={e => {
              setMessageInput(e.target.value)
            }}
            onKeyDown={handleKeyDown}
            placeholder={
              conversation.is_locked
                ? 'Conversation is locked. You can only read the content.'
                : 'Type your message...'
            }
            className="flex-1 resize-none min-h-[40px] max-h-32"
            disabled={isSending || conversation.is_locked}
            rows={1}
          />

          {/* Photo Uploader */}
          <PhotoUploader
            onSendPhoto={handleSendPhoto}
            disabled={isSending || conversation.is_locked}
            className="self-end"
          />

          {/* Audio Recorder */}
          <AudioRecorder
            onSendAudio={handleSendAudio}
            disabled={isSending || conversation.is_locked}
            className="self-end"
          />

          <Button
            type="submit"
            disabled={
              !messageInput.trim() || isSending || conversation?.is_locked
            }
            className="w-9 h-9 p-0 rounded-lg self-end gradient-btn text-white"
          >
            <Send className="h-4 w-4 mr-0.5 mt-0.5" />
          </Button>
        </form>
      </div>

      {/* Conversation Analysis Modal */}
      <ConversationAnalysisModal
        conversation={conversation}
        currentUser={user}
        users={users}
        conversationUserData={conversationUserData}
        isOpen={showAnalysisModal}
        onClose={() => setShowAnalysisModal(false)}
      />
    </div>
  )
}
