import { useState, useEffect } from 'react'

export interface UserPseudos {
  [userId: string]: string
}

export const useUserPseudos = (conversationId: string) => {
  const [userPseudos, setUserPseudos] = useState<UserPseudos>({})

  // Load pseudos from localStorage on mount
  useEffect(() => {
    const savedPseudos = localStorage.getItem(
      `conversation-${conversationId}-pseudos`
    )
    if (savedPseudos) {
      try {
        setUserPseudos(JSON.parse(savedPseudos))
      } catch (error) {
        console.error('Failed to parse saved pseudos:', error)
      }
    }
  }, [conversationId])

  // Get pseudo for a specific user
  const getUserPseudo = (userId: string): string | null => {
    return userPseudos[userId] || null
  }

  // Get display name (pseudo if available, otherwise username)
  const getDisplayName = (userId: string, username: string): string => {
    return userPseudos[userId] || username
  }

  return {
    userPseudos,
    getUserPseudo,
    getDisplayName,
  }
}
