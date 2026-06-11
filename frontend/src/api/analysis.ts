// Custom API functions for conversation analysis
export interface UserFeedback {
  user_id: string
  pseudo: string
  summary: string
  emoji: string
  badge: string
  badge_emoji: string
}

export interface ConversationAnalysisResponse {
  summary: string
  users_feedbacks: UserFeedback[]
}

export const getConversationAnalysis = async (
  conversationId: string,
  userId: string
): Promise<ConversationAnalysisResponse> => {
  const apiUrl = import.meta.env.VITE_API_URL || ''
  const response = await fetch(`${apiUrl}/chat/${conversationId}/analyse`, {
    method: 'GET',
    headers: {
      'User-Id': userId,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(
      `Failed to get conversation analysis: ${response.status} ${response.statusText}`
    )
  }

  return response.json()
}
