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
} from '@/api/generated'
import {
  apiApiGetMessages,
  apiApiPostMessage,
  apiApiGetUsers,
} from '@/api/generated'
import { getGravatarUrl, getUserInitials } from '@/lib/gravatar'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import FunBackground from '@/components/ui/fun-background'

interface ChatPageProps {
  conversation: ConversationResponse
  user: UserResponse
  onSendMessage?: (message: string) => void
  onBackToHome: () => void
  messages?: MessageResponse[]
  autoScroll?: boolean
}

export default function ChatPage({
  conversation,
  user,
  onSendMessage,
  onBackToHome,
  messages: initialMessages = [],
  autoScroll = true,
}: ChatPageProps) {
  const [messageInput, setMessageInput] = useState('')
  const [copied, setCopied] = useState(false)
  const [messages, setMessages] = useState<MessageResponse[]>(initialMessages)
  const [isLoading, setIsLoading] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [users, setUsers] = useState<Record<string, UserResponse>>({})
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(
    null
  )
  const [isPolling, setIsPolling] = useState(false)
  const [isUserTyping, setIsUserTyping] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const [showScrollButton, setShowScrollButton] = useState(false)
  const [wasAtBottom, setWasAtBottom] = useState(true)

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

  // Fetch messages when component mounts
  useEffect(() => {
    fetchMessages()
    fetchUsers()

    // Start polling for new messages every 1 second
    const interval = setInterval(() => {
      if (!isPolling && !isLoading && !isUserTyping) {
        fetchMessages(true) // Pass true to indicate this is a polling request
      }
    }, 1000)
    setPollingInterval(interval)

    // Cleanup polling on unmount
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval)
      }
    }
  }, [conversation.id])

  // Cleanup polling when component unmounts
  useEffect(() => {
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval)
      }
    }
  }, [pollingInterval])

  const fetchMessages = async (isPollingRequest = false) => {
    if (isPollingRequest) {
      setIsPolling(true)
    } else {
      setIsLoading(true)
    }

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
        // Only update messages if they're different (for polling efficiency)
        if (isPollingRequest) {
          // For polling, only update if the message count or content has changed
          const currentMessageIds = new Set(messages.map(m => m.id))
          const newMessageIds = new Set(response.data.map(m => m.id))

          if (
            currentMessageIds.size !== newMessageIds.size ||
            !response.data.every(m => currentMessageIds.has(m.id))
          ) {
            setMessages(response.data)
          }
        } else {
          // For manual refresh, always update
          setMessages(response.data)
        }
      }
    } catch (error) {
      console.error('Failed to fetch messages:', error)
      if (!isPollingRequest) {
        showToast.error(
          'Failed to load messages',
          'Please try refreshing the page.'
        )
      }
    } finally {
      if (isPollingRequest) {
        setIsPolling(false)
      } else {
        setIsLoading(false)
      }
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await sendMessage()
  }

  const sendMessage = async () => {
    if (messageInput.trim() && !isSending) {
      setIsSending(true)
      try {
        const messageData: MessagePost = {
          content: messageInput.trim(),
          conversation_id: conversation.id || '',
          issuer_id: user.id,
        }

        const response = await apiApiPostMessage({
          path: {
            conversation_id: conversation.id || '',
          },
          body: { message: messageData },
          headers: {
            'User-Id': user.id,
          },
        })

        if (response.data) {
          // Add the new message to the list
          setMessages(prev => [...prev, response.data])
          setMessageInput('')
          setIsUserTyping(false)

          // Show success toast for locked conversations
          if (conversation.is_locked) {
            showToast.success(
              'Message sent!',
              'Thanks for this message of great value.'
            )
          }

          // Call the optional callback
          if (onSendMessage) {
            onSendMessage(messageInput.trim())
          }
        }
      } catch (error) {
        console.error('Failed to send message:', error)
        showToast.error('Failed to send message', 'Please try again.')
      } finally {
        setIsSending(false)
      }
    }
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
      await navigator.clipboard.writeText(conversation.id || '')
      setCopied(true)
      showToast.success(
        'Conversation ID copied!',
        'Share this ID with others to join.'
      )
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error(error)
      showToast.error(
        'Failed to copy to clipboard',
        'Please copy the ID manually.'
      )
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
              <h2 className="text-xl text-nowrap font-semibold">
                {conversation.name}
              </h2>
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
          groupMessages(messages).map((group, groupIndex) => (
            <div
              key={`${group.userId}-${group.timestamp}`}
              className={`flex ${group.userId === user.id ? 'justify-end' : 'justify-start'} ${groupIndex > 0 ? 'mt-4' : ''}`}
            >
              <div
                className={`flex items-end gap-2 ${group.userId === user.id ? 'flex-row-reverse' : 'flex-row'}`}
              >
                {/* Avatar - only show on the last message of the group */}
                {
                  <Avatar
                    className={`h-6 w-6 flex-shrink-0 ${!conversation.is_visible ? 'blur-xs' : ''}`}
                  >
                    <AvatarImage
                      src={getGravatarUrl(
                        users[group.userId]?.username || group.userId,
                        100
                      )}
                      alt={users[group.userId]?.username || group.userId}
                    />
                    <AvatarFallback className="text-xs">
                      {getUserInitials(
                        users[group.userId]?.username || group.userId
                      )}
                    </AvatarFallback>
                  </Avatar>
                }

                {/* Message Group Content */}
                <div className="flex flex-col gap-1">
                  {group.messages.map(message => (
                    <div
                      key={message.id}
                      className={`flex ${group.userId === user.id ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`rounded-lg px-4 py-2 ${
                          group.userId === user.id
                            ? 'gradient-btn text-white'
                            : 'bg-muted'
                        } ${!conversation.is_visible ? 'blur-xs' : ''}`}
                      >
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
              setIsUserTyping(e.target.value.length > 0)
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
          <Button
            type="submit"
            disabled={
              !messageInput.trim() || isSending || conversation.is_locked
            }
            className="w-9 h-9 p-0 rounded-lg self-end gradient-btn text-white"
          >
            <Send className="h-4 w-4 mr-0.5 mt-0.5" />
          </Button>
        </form>
      </div>
    </div>
  )
}
