import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Send, ArrowLeft, Copy, Check, ChevronDown, X } from 'lucide-react'
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
import FunBackground from '@/components/ui/fun-background'
import UserManagementModal from './UserManagementModal'
import ConversationAnalysisModal from './ConversationAnalysisModal'
import InputTileGrid from './InputTileGrid'
import DrawingCanvas from './DrawingCanvas'
import TimerWarningModal from './TimerWarningModal'
import TimelineStrip from './TimelineStrip'
import RevealButton from './RevealButton'
import RevealWall from './RevealWall'
import MessageTile from './MessageTile'
import PartyHeatMeter from './PartyHeatMeter'
import { randomDare } from '@/lib/dares'
import { useCooldowns, type CooldownType } from '@/hooks/useCooldowns'
import { useAudioRecorder } from '@/hooks/useAudioRecorder'
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
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [showScrollButton, setShowScrollButton] = useState(false)
  const [wasAtBottom, setWasAtBottom] = useState(true)
  const [showAnalysisModal, setShowAnalysisModal] = useState(false)
  const [shouldShowAnalysisButton, setShouldShowAnalysisButton] =
    useState(false)
  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null)
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null)
  const [drawingBlob, setDrawingBlob] = useState<Blob | null>(null)
  const [drawingPreviewUrl, setDrawingPreviewUrl] = useState<string | null>(
    null
  )
  const [showDrawingCanvas, setShowDrawingCanvas] = useState(false)
  const [showTimerWarning, setShowTimerWarning] = useState(false)
  const [activeDare, setActiveDare] = useState<string | null>(null)
  const [timerWarningDismissed, setTimerWarningDismissed] = useState(false)
  const warnedThisSessionRef = useRef(false)
  const {
    cooldowns,
    refresh: refreshCooldowns,
    startCooldown,
  } = useCooldowns(conversation.id, user.id)
  const {
    isRecording: isRecordingAudio,
    audioBlob: recordedAudioBlob,
    startRecording,
    stopRecording,
    clearRecording,
  } = useAudioRecorder()
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)

  // Sync recorder output into the pending-send state
  useEffect(() => {
    if (recordedAudioBlob && !isRecordingAudio) {
      setAudioBlob(recordedAudioBlob)
    }
  }, [recordedAudioBlob, isRecordingAudio])
  const [longPressMessageId, setLongPressMessageId] = useState<string | null>(
    null
  )
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reactionsRef = useRef<HTMLDivElement | null>(null)
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  // Reveal state (teaser mode applies while not revealed)
  const [revealOverride, setRevealOverride] = useState(false)
  const isRevealed =
    revealOverride ||
    ((conversation as { is_revealed?: boolean }).is_revealed ?? false)
  const [liveReadyCount, setLiveReadyCount] = useState<number | null>(null)
  const [liveMemberCount, setLiveMemberCount] = useState<number | null>(null)
  const [analysisStatus, setAnalysisStatus] = useState<string>(
    (conversation as { analysis_status?: string }).analysis_status ?? 'idle'
  )
  const [partyBadges, setPartyBadges] = useState<
    Record<string, { name: string; emoji: string; wildness?: number }>
  >({})
  const [partyMeta, setPartyMeta] = useState<{
    title: string
    quote: string
    quoteAuthor: string
  } | null>(null)

  // Load per-party badges + golden-card extras from the analysis once revealed
  useEffect(() => {
    if (!isRevealed) return
    const fetchAnalysisBadges = async () => {
      try {
        const apiUrl = import.meta.env.VITE_API_URL || ''
        const response = await fetch(
          `${apiUrl}/chat/${conversation.id}/analyse`,
          { headers: { 'User-Id': user.id } }
        )
        if (response.ok) {
          const analysis = await response.json()
          const badges: Record<
            string,
            { name: string; emoji: string; wildness?: number }
          > = {}
          const feedbacks =
            analysis?.users_feedbacks || analysis?.user_feedbacks || []
          for (const feedback of feedbacks) {
            const uid = feedback.user_id || feedback.username
            if (uid && feedback.badge) {
              badges[uid] = {
                name: feedback.badge,
                emoji: feedback.badge_emoji || '\ud83c\udfc5',
                wildness: feedback.wildness_score || 0,
              }
            }
          }
          setPartyBadges(badges)
          if (analysis?.party_title || analysis?.quote_of_the_night) {
            setPartyMeta({
              title: analysis.party_title || '',
              quote: analysis.quote_of_the_night || '',
              quoteAuthor: analysis.quote_author || '',
            })
          }
        }
      } catch (error) {
        console.error('Failed to fetch analysis badges:', error)
      }
    }
    fetchAnalysisBadges()
  }, [isRevealed, conversation.id, user.id])

  const scrollToMessage = (messageId: string) => {
    const el = messageRefs.current.get(messageId)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add('ring-2', 'ring-primary', 'rounded-lg')
      setTimeout(() => {
        el.classList.remove('ring-2', 'ring-primary', 'rounded-lg')
      }, 1500)
    }
  }

  // Dismiss reaction menu on outside click/touch
  useEffect(() => {
    const handleOutsideInteraction = (e: MouseEvent | TouchEvent) => {
      if (
        reactionsRef.current &&
        !reactionsRef.current.contains(e.target as Node)
      ) {
        setLongPressMessageId(null)
      }
    }
    document.addEventListener('mousedown', handleOutsideInteraction)
    document.addEventListener('touchstart', handleOutsideInteraction)
    return () => {
      document.removeEventListener('mousedown', handleOutsideInteraction)
      document.removeEventListener('touchstart', handleOutsideInteraction)
    }
  }, [])

  // Auto-resize the note textarea based on content
  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      const lineHeight = 28 // 1.75rem — matches leading-7 and the ruled lines
      const padding = 16 // py-2 top + bottom
      const minHeight = lineHeight * 3 + padding // keep a note-page feel when empty
      const maxHeight = lineHeight * 8 + padding
      const newHeight = Math.min(
        Math.max(textarea.scrollHeight, minHeight),
        maxHeight
      )
      textarea.style.height = `${newHeight}px`
    }
  }, [messageInput])

  // WebSocket connection for real-time updates
  const wsUrl = import.meta.env.VITE_API_URL?.replace(/^http/, 'ws') || ''
  useWebSocket(`${wsUrl}/ws/chat/${conversation.id}/`, {
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
        // Handle message reaction updates in real-time — only update reacts, preserve media
        const wsMessage = message.message as MessageResponse
        setMessages(prev =>
          prev.map(msg =>
            msg.id === message.message_id
              ? { ...msg, reacts: wsMessage.reacts }
              : msg
          )
        )
      } else if (message.type === 'reveal_ready_changed') {
        // Live "X / Y members ready" counter
        setLiveReadyCount(message.ready_count)
        setLiveMemberCount(message.member_count)
      } else if (message.type === 'reveal_triggered') {
        // The reveal fires for everyone simultaneously
        setRevealOverride(true)
        showToast.success(
          'The night is revealed! \ud83c\udf89',
          'Discover what everyone shared.'
        )
      } else if (message.type === 'analysis_status_changed') {
        setAnalysisStatus(message.analysis_status)
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

        // Pick up the server-side timer warning preference for the current user
        const currentUserData = response.data.find(
          u => u.user_id === user.id
        ) as { timer_warning_dismissed?: boolean } | undefined
        if (currentUserData?.timer_warning_dismissed) {
          setTimerWarningDismissed(true)
        }
      }
    } catch (error) {
      console.error('Failed to fetch conversation user data:', error)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await sendMessage()
  }

  const getOutgoingMessageType = (): CooldownType | 'text' => {
    if (drawingBlob) return 'drawing'
    if (audioBlob) return 'voice'
    if (selectedPhoto) return 'media'
    return 'text'
  }

  const sendMessage = async () => {
    const messageType = getOutgoingMessageType()

    // First-send warning for cooldown-limited message types
    if (
      messageType !== 'text' &&
      !timerWarningDismissed &&
      !warnedThisSessionRef.current
    ) {
      setShowTimerWarning(true)
      return
    }

    await doSendMessage()
  }

  const handleTimerWarningConfirm = async (dontWarnAgain: boolean) => {
    setShowTimerWarning(false)
    warnedThisSessionRef.current = true
    if (dontWarnAgain) {
      setTimerWarningDismissed(true)
      // Persist server-side so the modal never shows again
      try {
        const apiUrl = import.meta.env.VITE_API_URL || ''
        await fetch(`${apiUrl}/chat/${conversation.id}/user/${user.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'User-Id': user.id,
          },
          body: JSON.stringify({ timer_warning_dismissed: true }),
        })
      } catch (error) {
        console.error('Failed to persist timer warning preference:', error)
      }
    }
    await doSendMessage()
  }

  const doSendMessage = async () => {
    const messageType = getOutgoingMessageType()
    if (
      (messageInput.trim() || audioBlob || selectedPhoto || drawingBlob) &&
      !isSending
    ) {
      setIsSending(true)
      try {
        const messageData: MessagePost = {
          content: messageInput.trim(),
          conversation_id: conversation.id || '',
          issuer_id: user.id,
          message_type: messageType,
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

        if (selectedPhoto) {
          formData.append('medias', selectedPhoto)
        }

        if (drawingBlob) {
          const drawingFile = new File(
            [drawingBlob],
            `drawing_${Date.now()}.png`,
            { type: 'image/png' }
          )
          formData.append('medias', drawingFile)
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
          // Message will be added via WebSocket, just clear input and media
          setMessageInput('')
          clearSelectedPhoto()
          clearAudioRecording()
          clearDrawing()
          setActiveDare(null)

          // Start the local cooldown countdown for this type
          if (messageType !== 'text') {
            startCooldown(messageType)
          }

          // Show success toast for locked conversations or media messages
          if (conversation.is_locked || messageType !== 'text') {
            const messageLabel =
              messageType === 'voice'
                ? 'Voice message'
                : messageType === 'drawing'
                  ? 'Drawing'
                  : messageType === 'media'
                    ? 'Photo/Video'
                    : 'Message'
            showToast.success(
              `${messageLabel} sent!`,
              messageType === 'voice'
                ? 'Your voice message has been delivered.'
                : messageType === 'drawing'
                  ? 'Your masterpiece has been shared.'
                  : messageType === 'media'
                    ? 'Your media has been shared.'
                    : 'Thanks for this message of great value.'
            )
          }

          // Call the optional callback
          if (onSendMessage) {
            const content =
              messageType === 'voice'
                ? '[Audio Message]'
                : messageType === 'drawing'
                  ? '[Drawing]'
                  : messageType === 'media'
                    ? '[Photo]'
                    : messageInput.trim()
            onSendMessage(content)
          }
        } else if (response.status === 429) {
          const errorData = await response.json().catch(() => null)
          const retrySeconds = errorData?.retry_after_seconds
          const minutes = retrySeconds ? Math.ceil(retrySeconds / 60) : 30
          showToast.error(
            'Slow down! \u23f3',
            `You can send another ${messageType} message in ${minutes} min.`
          )
          refreshCooldowns()
        } else {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }
      } catch (error) {
        console.error('Failed to send message:', error)
        showToast.error(`Failed to send ${messageType}`, 'Please try again.')
      } finally {
        setIsSending(false)
      }
    }
  }

  const handlePhotoSelect = (photoFile: File | null) => {
    if (photoFile) {
      setSelectedPhoto(photoFile)
      const url = URL.createObjectURL(photoFile)
      setPhotoPreviewUrl(url)
    } else {
      clearSelectedPhoto()
    }
  }

  const clearSelectedPhoto = () => {
    if (photoPreviewUrl) {
      URL.revokeObjectURL(photoPreviewUrl)
    }
    setSelectedPhoto(null)
    setPhotoPreviewUrl(null)
  }

  const clearAudioRecording = () => {
    setAudioBlob(null)
    clearRecording()
  }

  const handleVoiceToggle = async () => {
    if (isRecordingAudio) {
      stopRecording()
    } else {
      try {
        await startRecording()
      } catch (error) {
        showToast.error(
          'Recording failed',
          error instanceof Error ? error.message : 'Unknown error'
        )
      }
    }
  }

  const handleDrawingDone = (pngBlob: Blob) => {
    setDrawingBlob(pngBlob)
    setDrawingPreviewUrl(URL.createObjectURL(pngBlob))
    setShowDrawingCanvas(false)
  }

  const clearDrawing = () => {
    if (drawingPreviewUrl) {
      URL.revokeObjectURL(drawingPreviewUrl)
    }
    setDrawingBlob(null)
    setDrawingPreviewUrl(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
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

        {/* Live party heat: how hot is the night right now */}
        {!isRevealed && <PartyHeatMeter messages={messages} />}
      </div>

      {/* Reveal the night button — shown to everyone once locked, until the reveal fires */}
      {conversation.is_locked && !isRevealed && (
        <RevealButton
          conversationId={conversation.id}
          userId={user.id}
          liveReadyCount={liveReadyCount}
          liveMemberCount={liveMemberCount}
        />
      )}

      {/* Analysis Button - show when conversation is locked */}
      {(conversation.is_locked || shouldShowAnalysisButton) && (
        <div className="bg-primary/10 border-b px-4 py-3 relative z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-primary">
              <span className="text-lg">✨</span>
              <div>
                <p className="font-medium text-sm">Night Analysis Available</p>
                <p className="text-xs text-muted-foreground">
                  The conversation has been analyzed. View highlights and
                  summary.
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

      {/* Reveal view: post-it wall replaces the chat scroll once revealed */}
      {isRevealed ? (
        <RevealWall
          messages={messages}
          currentUserId={user.id}
          conversationUserData={conversationUserData}
          usernames={Object.fromEntries(
            Object.entries(users).map(([id, u]) => [id, u.username])
          )}
          partyBadges={partyBadges}
          partyMeta={partyMeta}
          isAnalysisRunning={analysisStatus === 'running'}
        />
      ) : (
        <>
          {/* Timeline + Messages Area */}
          <div className="flex flex-1 min-h-0 relative z-10">
            {/* Timeline strip with one colored dot per message */}
            <TimelineStrip
              messages={messages}
              isLocked={conversation.is_locked}
              onDotClick={scrollToMessage}
            />

            <div
              className="flex-1 overflow-y-auto pl-2 pr-4 pt-4 pb-4 space-y-3 min-h-0 relative"
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
                    className={`flex flex-col ${group.userId === user.id ? 'items-end' : 'items-start'} ${groupIndex > 0 ? 'mt-3' : ''}`}
                  >
                    {/* Paper note tiles — identity is signed on the note itself,
                  the old avatar side-column is gone */}
                    <div className="flex w-full flex-col gap-1.5">
                      {group.messages.map((message, msgIndex) => {
                        const isOwn = group.userId === user.id
                        // Teaser mode: others' messages stay blurred until reveal
                        const isTeased = !isRevealed && !isOwn

                        return (
                          <div
                            key={message.id}
                            className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}
                          >
                            {/* Shrink-wrapped so the long-press target and the
                                timeline highlight ring hug the tile, not the row */}
                            <div
                              ref={el => {
                                if (el) {
                                  messageRefs.current.set(message.id, el)
                                } else {
                                  messageRefs.current.delete(message.id)
                                }
                              }}
                              className="w-fit max-w-[min(20rem,80%)]"
                              onTouchStart={() => {
                                longPressTimerRef.current = setTimeout(() => {
                                  setLongPressMessageId(message.id)
                                }, 500)
                              }}
                              onTouchEnd={() => {
                                if (longPressTimerRef.current) {
                                  clearTimeout(longPressTimerRef.current)
                                  longPressTimerRef.current = null
                                }
                              }}
                              onTouchMove={() => {
                                if (longPressTimerRef.current) {
                                  clearTimeout(longPressTimerRef.current)
                                  longPressTimerRef.current = null
                                }
                              }}
                            >
                              <MessageTile
                                message={message}
                                isOwn={isOwn}
                                isTeased={isTeased}
                                isVisible={conversation.is_visible}
                                isFirstOfGroup={msgIndex === 0}
                                smiley={
                                  conversationUserData[group.userId]?.smiley
                                }
                                displayName={
                                  conversationUserData[group.userId]?.pseudo ||
                                  users[group.userId]?.username ||
                                  'Mystery guest'
                                }
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Reactions & long-press menus — sticker chips below the tiles */}
                    {group.messages.map(message => {
                      const hasReactions =
                        message.reacts && message.reacts.length > 0
                      const showLongPress = longPressMessageId === message.id
                      if (!hasReactions && !showLongPress) return null
                      return (
                        <div
                          key={`reactions-${message.id}`}
                          className={`relative z-10 -mt-1 ${group.userId === user.id ? 'pr-3' : 'pl-3'}`}
                        >
                          {/* Reactions */}
                          {hasReactions && (
                            <div
                              className={`flex flex-wrap gap-1 mt-1 ${group.userId === user.id ? 'justify-end' : 'justify-start'}`}
                            >
                              {Array.from(
                                new Set(
                                  (message.reacts || []).map(r => r.emoji)
                                )
                              ).map(emoji => {
                                const count = getReactionCount(message, emoji)
                                const userReacted = hasUserReacted(
                                  message,
                                  emoji
                                )
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

                          {/* Add Reaction Buttons - show on long press */}
                          {showLongPress && (
                            <div
                              ref={reactionsRef}
                              className={`flex gap-1 mt-1 bg-card shadow-lg rounded-full px-2 py-1 border ${group.userId === user.id ? 'justify-end' : 'justify-start'}`}
                            >
                              {['🥵', '💖', '😎', '👅', '💦', '🦄'].map(
                                emoji => (
                                  <button
                                    key={emoji}
                                    onClick={() => {
                                      handleReaction(message.id, emoji)
                                      setLongPressMessageId(null)
                                    }}
                                    disabled={conversation.is_locked}
                                    className={`p-1 rounded-full text-sm transition-colors ${
                                      conversation.is_locked
                                        ? 'cursor-not-allowed opacity-50'
                                        : 'active:bg-muted cursor-pointer'
                                    }`}
                                  >
                                    {emoji}
                                  </button>
                                )
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
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
          </div>

          {/* Message Input — 3-tile grid */}
          <div className="border-t bg-card p-4 relative z-10">
            <form onSubmit={handleSubmit} className="flex flex-col gap-2">
              {/* Paper note field: a sheet of ruled paper taped to the desk,
              media previews clipped on top, send as a sticker-stamp */}
              <div
                className={`relative rotate-[-0.4deg] rounded-[4px] border border-amber-900/15 bg-[#FFFBEB] shadow-[2px_3px_8px_rgba(0,0,0,0.18)] transition-shadow focus-within:shadow-[2px_4px_14px_rgba(0,0,0,0.3)] dark:shadow-[2px_3px_10px_rgba(0,0,0,0.6)] ${conversation.is_locked ? 'opacity-60' : ''}`}
              >
                {/* Tape strips holding the note down */}
                <span
                  aria-hidden
                  className="absolute -top-2 left-4 h-4 w-10 rotate-[-5deg] rounded-[1px] bg-white/60 shadow-[0_1px_2px_rgba(0,0,0,0.15)] backdrop-blur-[1px]"
                />
                <span
                  aria-hidden
                  className="absolute -top-2 right-8 h-4 w-10 rotate-[4deg] rounded-[1px] bg-white/60 shadow-[0_1px_2px_rgba(0,0,0,0.15)] backdrop-blur-[1px]"
                />

                {/* Party dare dice: a sticker on the sheet's corner — tap to
                roll a challenge, tap again to reroll */}
                {!conversation.is_locked && (
                  <button
                    type="button"
                    aria-label="Roll a party dare"
                    onClick={() => setActiveDare(randomDare(activeDare))}
                    className="absolute -top-3.5 -right-2 z-10 flex h-8 w-8 rotate-6 items-center justify-center rounded-full bg-white text-lg shadow-md transition-transform hover:rotate-[14deg] hover:scale-110 active:rotate-[180deg]"
                  >
                    🎲
                  </button>
                )}

                {/* Active dare: a challenge sticker stuck on the paper */}
                {activeDare && !conversation.is_locked && (
                  <div className="px-3 pt-3">
                    <div className="relative flex rotate-[0.6deg] items-start gap-2 rounded-[2px] border border-amber-300/70 bg-amber-100 px-2.5 py-1.5 shadow-sm">
                      <span className="text-sm leading-snug">🎲</span>
                      <p className="font-note flex-1 text-[13px] leading-snug font-medium text-amber-900">
                        Dare: {activeDare}
                      </p>
                      <button
                        type="button"
                        aria-label="Dismiss dare"
                        onClick={() => setActiveDare(null)}
                        className="text-amber-700/70 hover:text-amber-900"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Media previews: chips clipped onto the top of the sheet, each
                echoing the tile its message will become */}
                {(selectedPhoto || audioBlob || drawingBlob) && (
                  <div className="flex flex-wrap items-center gap-3 px-3 pt-3">
                    {selectedPhoto && photoPreviewUrl && (
                      <div className="relative flex flex-1 rotate-[-1.5deg] items-center gap-2 rounded-[2px] bg-white p-1.5 shadow-md">
                        <span
                          aria-hidden
                          className="absolute -top-1.5 left-3 h-3 w-8 rotate-[-6deg] bg-white/70 shadow-sm"
                        />
                        <img
                          src={photoPreviewUrl}
                          alt="Selected photo"
                          className="h-12 w-12 rounded-[1px] border object-cover"
                        />
                        <div className="flex min-w-0 flex-col">
                          <span className="font-note text-xs font-medium text-gray-800">
                            Photo selected
                          </span>
                          <span className="truncate text-[10px] text-gray-500">
                            {selectedPhoto.name} (
                            {(selectedPhoto.size / 1024).toFixed(1)} KB)
                          </span>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={clearSelectedPhoto}
                          className="ml-auto h-7 w-7 p-0 text-gray-600 hover:text-gray-900"
                          type="button"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                    {audioBlob && (
                      <div className="relative flex flex-1 rotate-[1deg] items-center gap-2 rounded-[3px] bg-gray-800 p-2 shadow-md">
                        <span
                          aria-hidden
                          className="absolute -top-1.5 left-3 h-3 w-8 rotate-[5deg] bg-white/50 shadow-sm"
                        />
                        <span className="h-3 w-3 animate-pulse rounded-full bg-red-500" />
                        <div className="flex flex-col">
                          <span className="font-note text-xs font-medium text-white">
                            Audio recorded
                          </span>
                          <span className="text-[10px] text-gray-400">
                            Ready to send
                          </span>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={clearAudioRecording}
                          className="ml-auto h-7 w-7 p-0 text-gray-300 hover:text-white"
                          type="button"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                    {drawingBlob && drawingPreviewUrl && (
                      <div className="relative flex flex-1 rotate-[-1deg] items-center gap-2 rounded-[2px] border-2 border-dashed border-gray-300 bg-white p-1.5 shadow-md">
                        <span
                          aria-hidden
                          className="absolute -top-1.5 left-3 h-3 w-8 rotate-[-4deg] bg-white/70 shadow-sm"
                        />
                        <img
                          src={drawingPreviewUrl}
                          alt="Drawing preview"
                          className="h-12 w-12 rounded-[1px] bg-white object-cover"
                        />
                        <div className="flex flex-col">
                          <span className="font-note text-xs font-medium text-gray-800">
                            Drawing ready 🎨
                          </span>
                          <span className="text-[10px] text-gray-500">
                            Add a caption or send it as is
                          </span>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={clearDrawing}
                          className="ml-auto h-7 w-7 p-0 text-gray-600 hover:text-gray-900"
                          type="button"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {/* Ruled writing surface (handlers and disabled logic unchanged) */}
                <Textarea
                  ref={textareaRef}
                  value={messageInput}
                  onChange={e => {
                    setMessageInput(e.target.value)
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    conversation.is_locked
                      ? 'Conversation is locked. You can only read the content.'
                      : selectedPhoto
                        ? 'Add a caption (optional)...'
                        : audioBlob
                          ? 'Add text to your audio message (optional)...'
                          : drawingBlob
                            ? 'Add a caption to your drawing (optional)...'
                            : 'Note your feelings about tonight\u2019s party before you forget about it...'
                  }
                  className="note-ruled field-sizing-fixed min-h-0 w-full resize-none overflow-y-auto rounded-none border-0 bg-transparent pl-[1.4rem] pr-14 font-note text-[15px] leading-7 text-gray-800 shadow-none caret-pink-500 placeholder:italic placeholder:text-gray-400/90 focus-visible:border-0 focus-visible:ring-0 md:text-[15px] dark:bg-transparent"
                  disabled={isSending || conversation.is_locked}
                  rows={Math.min(
                    8,
                    Math.max(3, messageInput.split('\n').length)
                  )}
                />

                {/* Send = sticker stamp glued to the note's corner */}
                <Button
                  type="submit"
                  aria-label="Send note"
                  disabled={
                    (!messageInput.trim() &&
                      !selectedPhoto &&
                      !audioBlob &&
                      !drawingBlob) ||
                    isSending ||
                    conversation?.is_locked
                  }
                  className="gradient-btn absolute right-2 bottom-2 h-10 w-10 rotate-3 rounded-md p-0 text-white shadow-md active:rotate-0 active:scale-95"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>

              {/* 3-tile grid with per-type cooldown countdowns */}
              {!conversation.is_locked && (
                <InputTileGrid
                  cooldowns={cooldowns}
                  disabled={isSending || conversation.is_locked}
                  isRecording={isRecordingAudio}
                  onPhotoSelect={handlePhotoSelect}
                  onVoiceToggle={handleVoiceToggle}
                  onDrawingOpen={() => setShowDrawingCanvas(true)}
                />
              )}
            </form>
          </div>
        </>
      )}

      {/* Drawing Canvas */}
      <DrawingCanvas
        isOpen={showDrawingCanvas}
        onClose={() => setShowDrawingCanvas(false)}
        onSend={handleDrawingDone}
        isSending={isSending}
      />

      {/* First-send timer warning */}
      <TimerWarningModal
        isOpen={showTimerWarning}
        onConfirm={handleTimerWarningConfirm}
        onCancel={() => setShowTimerWarning(false)}
      />

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
