import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Card, CardContent } from '@/components/ui/card'
import { Users, Save, X } from 'lucide-react'
import EmojiPickerComponent from '@/components/ui/emoji-picker'
import { showToast } from '@/lib/toast'
import { getGravatarUrl, getUserInitials } from '@/lib/gravatar'
import type { UserResponse, ConversationResponse } from '@/api/generated'
import {
  apiApiGetUsers,
  apiApiGetConversationUsers,
  apiApiUpdateConversationUser,
  apiApiPatchConversation,
} from '@/api/generated'

interface UserManagementModalProps {
  conversation: ConversationResponse
  currentUser: UserResponse
  trigger?: React.ReactNode
  onConversationUpdate?: (updatedConversation: ConversationResponse) => void
}

interface UserWithData extends UserResponse {
  pseudo?: string
  smiley?: string
}

export default function UserManagementModal({
  conversation: initialConversation,
  currentUser,
  trigger,
  onConversationUpdate,
}: UserManagementModalProps) {
  const [conversation, setConversation] =
    useState<ConversationResponse>(initialConversation)
  const [isOpen, setIsOpen] = useState(false)
  const [users, setUsers] = useState<UserWithData[]>([])
  const [editingUserId, setEditingUserId] = useState<string | null>(null)
  const [editingField, setEditingField] = useState<
    'pseudo' | 'smiley' | 'conversation_name' | null
  >(null)
  const [pseudoInput, setPseudoInput] = useState('')
  const [smileyInput, setSmileyInput] = useState('')
  const [conversationNameInput, setConversationNameInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  // Sync conversation state when prop changes (for websocket updates)
  useEffect(() => {
    setConversation(initialConversation)
  }, [initialConversation])

  // Listen for user data changes from websocket
  useEffect(() => {
    const handleUserDataChanged = (event: CustomEvent) => {
      const { conversationId, userId, pseudo, smiley } = event.detail

      // Only process if it's for this conversation and modal is open
      if (conversationId === conversation.id && isOpen) {
        // Update local state directly instead of refetching all users
        setUsers(prevUsers =>
          prevUsers.map(user =>
            user.id === userId
              ? {
                  ...user,
                  ...(pseudo !== undefined && { pseudo }),
                  ...(smiley !== undefined && { smiley }),
                }
              : user
          )
        )
      }
    }

    window.addEventListener(
      'userDataChanged',
      handleUserDataChanged as EventListener
    )

    return () => {
      window.removeEventListener(
        'userDataChanged',
        handleUserDataChanged as EventListener
      )
    }
  }, [conversation.id, isOpen])

  const fetchUsers = async () => {
    setIsLoading(true)
    try {
      // Fetch all users
      const usersResponse = await apiApiGetUsers({
        headers: {
          'User-Id': currentUser.id,
        },
      })

      // Fetch conversation user data (pseudos and smileys)
      const conversationUsersResponse = await apiApiGetConversationUsers({
        path: { conversation_id: conversation.id },
        headers: {
          'User-Id': currentUser.id,
        },
      })

      if (
        usersResponse.data &&
        Array.isArray(usersResponse.data) &&
        conversationUsersResponse.data
      ) {
        const allUsers = usersResponse.data
        const convUsers = conversationUsersResponse.data

        // Filter users to only show those in the conversation and merge with conversation data
        const conversationUserIds = Object.keys(conversation.users)
        const filteredUsers = allUsers.filter(user =>
          conversationUserIds.includes(user.id)
        )

        const usersWithData = filteredUsers.map(user => {
          const convUser = convUsers.find(cu => cu.user_id === user.id)
          return {
            ...user,
            pseudo: convUser?.pseudo || '',
            smiley: convUser?.smiley || '',
          }
        })

        setUsers(usersWithData)
      }
    } catch (error) {
      console.error('Failed to fetch users:', error)
      showToast.error('Failed to load users', 'Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open)
    if (open) {
      fetchUsers()
    }
  }

  const handleEditField = (
    userId: string,
    field: 'pseudo' | 'smiley' | 'conversation_name',
    currentValue: string
  ) => {
    setEditingUserId(userId)
    setEditingField(field)
    if (field === 'pseudo') {
      setPseudoInput(currentValue)
    } else if (field === 'smiley') {
      setSmileyInput(currentValue)
    } else if (field === 'conversation_name') {
      setConversationNameInput(currentValue)
    }
  }

  const handleSaveField = async (userId: string) => {
    try {
      if (editingField === 'conversation_name') {
        // Handle conversation name update
        await apiApiPatchConversation({
          path: {
            conversation_id: conversation.id,
          },
          body: {
            name: conversationNameInput.trim() || conversation.name,
          },
        })

        // Update the conversation object and notify parent
        const updatedConversation = {
          ...conversation,
          name: conversationNameInput.trim() || conversation.name,
        }

        // Update local state first
        setConversation(updatedConversation)

        // Then notify parent
        if (onConversationUpdate) {
          onConversationUpdate(updatedConversation)
        }

        // Don't show toast notification here - the user initiated the change
        // The WebSocket will handle notifications for other users
        handleCancelEdit()
        return
      }

      const updateData: { pseudo?: string; smiley?: string } = {}

      if (editingField === 'pseudo') {
        updateData.pseudo = pseudoInput.trim() || undefined
      } else if (editingField === 'smiley') {
        updateData.smiley = smileyInput.trim() || undefined
      }

      // Update on server
      await apiApiUpdateConversationUser({
        path: {
          conversation_id: conversation.id,
          target_user_id: userId,
        },
        body: updateData,
        headers: {
          'User-Id': currentUser.id,
        },
      })

      // Update local state
      setUsers(
        users.map(user =>
          user.id === userId
            ? {
                ...user,
                ...(editingField === 'pseudo' && {
                  pseudo: pseudoInput.trim(),
                }),
                ...(editingField === 'smiley' && {
                  smiley: smileyInput.trim(),
                }),
              }
            : user
        )
      )

      setEditingUserId(null)
      setEditingField(null)
      setPseudoInput('')
      setSmileyInput('')

      // Don't show toast notification here - the user initiated the change
      // The WebSocket will handle notifications for other users
    } catch (error) {
      console.error('Failed to update user data:', error)
      showToast.error('Update failed', 'Please try again.')
    }
  }

  const handleCancelEdit = () => {
    setEditingUserId(null)
    setEditingField(null)
    setPseudoInput('')
    setSmileyInput('')
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="ghost" size="sm" className="gap-2">
            <Users className="h-4 w-4" />
            Manage Users
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {editingField === 'conversation_name' ? (
              <div className="flex items-center gap-2 flex-1">
                <Input
                  value={conversationNameInput}
                  onChange={e => setConversationNameInput(e.target.value)}
                  placeholder="Conversation name"
                  className="h-7 text-sm flex-1"
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      handleSaveField('conversation')
                    } else if (e.key === 'Escape') {
                      handleCancelEdit()
                    }
                  }}
                  autoFocus
                />
                <Button
                  size="sm"
                  onClick={() => handleSaveField('conversation')}
                  className="h-7 w-7 p-0"
                >
                  <Save className="h-3 w-3" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleCancelEdit}
                  className="h-7 w-7 p-0"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <button
                onClick={() =>
                  handleEditField(
                    'conversation',
                    'conversation_name',
                    conversation.name
                  )
                }
                className="hover:bg-muted/50 rounded px-2 py-1 transition-colors text-left"
                title="Click to edit conversation name"
              >
                {conversation.name}
              </button>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-center">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto mb-2"></div>
                <p className="text-muted-foreground">Loading users...</p>
              </div>
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-8">
              <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <p className="text-muted-foreground">
                No users found in this conversation.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {users.map(user => (
                <Card
                  key={user.id}
                  className="transition-colors hover:bg-muted/50"
                >
                  <CardContent className="p-3">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarImage
                          src={getGravatarUrl(user.username, 100)}
                          alt={user.username}
                        />
                        <AvatarFallback>
                          {getUserInitials(user.username)}
                        </AvatarFallback>
                      </Avatar>

                      {/* Single line with clickable username and smiley */}
                      <div className="flex items-center gap-3 flex-1">
                        {user.id === currentUser.id && (
                          <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full">
                            You
                          </span>
                        )}

                        {/* Clickable Username/Pseudo */}
                        {editingUserId === user.id &&
                        editingField === 'pseudo' ? (
                          <div className="flex items-center gap-2 flex-1">
                            <Input
                              value={pseudoInput}
                              onChange={e => setPseudoInput(e.target.value)}
                              placeholder="Enter nickname..."
                              className="h-7 text-sm"
                              onKeyDown={e => {
                                if (e.key === 'Enter') {
                                  handleSaveField(user.id)
                                } else if (e.key === 'Escape') {
                                  handleCancelEdit()
                                }
                              }}
                              autoFocus
                            />
                            <Button
                              size="sm"
                              onClick={() => handleSaveField(user.id)}
                              className="h-7 w-7 p-0"
                            >
                              <Save className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={handleCancelEdit}
                              className="h-7 w-7 p-0"
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          <button
                            onClick={() =>
                              handleEditField(
                                user.id,
                                'pseudo',
                                user.pseudo || ''
                              )
                            }
                            className="flex-1 text-left hover:bg-muted/50 rounded px-2 py-1 transition-colors"
                            title="Click to edit nickname"
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">
                                {user.username}
                              </span>
                              {user.pseudo && (
                                <span className="text-xs text-muted-foreground">
                                  "{user.pseudo}"
                                </span>
                              )}
                            </div>
                          </button>
                        )}

                        {/* Clickable Smiley */}
                        {editingUserId === user.id &&
                        editingField === 'smiley' ? (
                          <div className="flex items-center gap-2">
                            <EmojiPickerComponent
                              onSelect={emoji => {
                                setSmileyInput(emoji)
                                // Don't auto-save, let user click save button
                              }}
                              trigger={
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7"
                                >
                                  {smileyInput || user.smiley || '😀'} Pick
                                </Button>
                              }
                            />
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => handleSaveField(user.id)}
                              className="h-7 w-7 p-0"
                            >
                              <Save className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={handleCancelEdit}
                              className="h-7 w-7 p-0"
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          <button
                            onClick={() =>
                              handleEditField(
                                user.id,
                                'smiley',
                                user.smiley || ''
                              )
                            }
                            className="flex items-center justify-center w-8 h-8 hover:bg-muted/50 rounded-full transition-colors"
                            title="Click to edit smiley"
                          >
                            <span className="text-xl">
                              {user.smiley || '😀'}
                            </span>
                          </button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
