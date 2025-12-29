import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { getGravatarUrl, getUserInitials } from '@/lib/gravatar'
import { showToast } from '@/lib/toast'
import {
  getConversationAnalysis,
  ConversationAnalysisResponse,
} from '@/api/analysis'
import type { UserResponse, ConversationResponse } from '@/api/generated'
import { Loader2, Sparkles } from 'lucide-react'

interface ConversationAnalysisModalProps {
  conversation: ConversationResponse
  currentUser: UserResponse
  users: Record<string, UserResponse>
  conversationUserData: Record<string, { pseudo?: string; smiley?: string }>
  isOpen: boolean
  onClose: () => void
}

export default function ConversationAnalysisModal({
  conversation,
  currentUser,
  users,
  conversationUserData,
  isOpen,
  onClose,
}: ConversationAnalysisModalProps) {
  const [analysis, setAnalysis] = useState<ConversationAnalysisResponse | null>(
    null
  )
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen && !analysis) {
      fetchAnalysis()
    }
  }, [isOpen])

  const fetchAnalysis = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const result = await getConversationAnalysis(
        conversation.id,
        currentUser.id
      )
      setAnalysis(result)
    } catch (err) {
      console.error('Failed to fetch conversation analysis:', err)
      setError('Failed to load conversation analysis. Please try again.')
      showToast.error(
        'Analysis failed',
        'Could not load the conversation analysis.'
      )
    } finally {
      setIsLoading(false)
    }
  }

  const handleClose = () => {
    onClose()
    // Reset state when closing
    setTimeout(() => {
      setAnalysis(null)
      setError(null)
    }, 300)
  }

  const getUserDisplayName = (userId: string) => {
    const userData = conversationUserData[userId]
    const user = users[userId]
    return userData?.pseudo || user?.username || userId
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Night Analysis - {conversation.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <div className="text-center">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
                <p className="text-muted-foreground">
                  Analyzing the conversation...
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  This may take a moment
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="text-center py-8">
              <p className="text-destructive mb-4">{error}</p>
              <Button onClick={fetchAnalysis} variant="outline">
                Try Again
              </Button>
            </div>
          )}

          {analysis && (
            <>
              {/* Global Summary */}
              <div className="space-y-3">
                <h3 className="text-lg font-semibold">Overall Summary</h3>
                <div className="bg-muted/50 rounded-lg p-4">
                  <p className="text-sm leading-relaxed">{analysis.summary}</p>
                </div>
              </div>

              {/* User Feedback */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Individual Highlights</h3>
                <div className="grid gap-4">
                  {Object.entries(analysis.users_feedback).map(
                    ([userId, feedback]) => {
                      const user = users[userId]
                      const userData = conversationUserData[userId]

                      if (!user) return null

                      return (
                        <div
                          key={userId}
                          className="flex items-start gap-3 p-4 rounded-lg border bg-card"
                        >
                          {/* User Avatar/Emoji */}
                          <div className="flex-shrink-0">
                            {userData?.smiley ? (
                              <div className="h-10 w-10 flex items-center justify-center rounded-full bg-muted">
                                <span className="text-xl">
                                  {userData.smiley}
                                </span>
                              </div>
                            ) : (
                              <Avatar className="h-10 w-10">
                                <AvatarImage
                                  src={getGravatarUrl(user.username, 100)}
                                  alt={user.username}
                                />
                                <AvatarFallback>
                                  {getUserInitials(user.username)}
                                </AvatarFallback>
                              </Avatar>
                            )}
                          </div>

                          {/* User Info and Feedback */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <h4 className="font-medium">
                                {getUserDisplayName(userId)}
                              </h4>
                              <span className="text-2xl" title="Night emoji">
                                {feedback.emoji}
                              </span>
                            </div>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                              {feedback.summary}
                            </p>
                          </div>
                        </div>
                      )
                    }
                  )}
                </div>
              </div>

              {/* Footer Info */}
              <div className="pt-4 border-t">
                <p className="text-xs text-muted-foreground text-center">
                  This analysis was generated when the conversation was locked
                  and reflects the overall mood and highlights of the night.
                </p>
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end pt-4">
          <Button onClick={handleClose} variant="outline">
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
