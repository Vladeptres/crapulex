import { useState, useEffect } from 'react'

import { client } from '@/api/generated/client.gen'
import type { ConversationResponse, UserResponse } from '@/api/generated'
import { apiApiGetConversation, apiApiJoinConversation } from '@/api/generated'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/sonner'
import WelcomeScreen from '@/components/auth/WelcomeScreen'
import LoginDialog from '@/components/auth/LoginDialog'
import ChatPage from '@/components/chat/ChatPage'
import { useAuth } from '@/hooks/useAuth'
import { showToast } from '@/lib/toast'

import './App.css'

const apiUrl = import.meta.env.VITE_API_URL || ''
console.log('Setting API baseURL to:', apiUrl)

client.setConfig({
  baseURL: apiUrl,
})

function App() {
  const { user, login, logout, isLoading } = useAuth()
  const [showLogin, setShowLogin] = useState(false)
  const [currentConversation, setCurrentConversation] =
    useState<ConversationResponse | null>(null)
  const [isJoiningConversation, setIsJoiningConversation] = useState(false)

  // Handle URL-based conversation joining
  useEffect(() => {
    const handleUrlRouting = async () => {
      const path = window.location.pathname
      const joinMatch = path.match(/^\/join\/(.+)$/)

      if (joinMatch && user && !currentConversation) {
        const conversationId = joinMatch[1]
        await handleJoinConversationFromUrl(conversationId)
      }
    }

    if (user && !isLoading) {
      handleUrlRouting()
    }
  }, [user, isLoading, currentConversation])

  // Show login dialog if user is not authenticated and not loading
  useEffect(() => {
    if (!isLoading && !user) {
      setShowLogin(true)
    }
  }, [isLoading, user])

  const handleLoginSuccess = (userData: UserResponse) => {
    login(userData)
    setShowLogin(false)
  }

  const handleLogout = () => {
    logout()
    setShowLogin(true)
    setCurrentConversation(null)
  }

  const handleJoinConversationFromUrl = async (conversationId: string) => {
    if (!user || isJoiningConversation) return

    setIsJoiningConversation(true)
    try {
      // First try to get the conversation details
      const conversationResponse = await apiApiGetConversation({
        path: { conversation_id: conversationId },
        headers: { 'User-Id': user.id },
      })

      if (conversationResponse.data) {
        // Check if user is already part of the conversation
        const userIds = Object.keys(conversationResponse.data.users || {})
        const isAlreadyMember = userIds.includes(user.id)

        if (!isAlreadyMember) {
          // Join the conversation
          await apiApiJoinConversation({
            path: { conversation_id: conversationId },
            headers: { 'User-Id': user.id },
          })
          showToast.success(
            'Joined conversation!',
            `Welcome to "${conversationResponse.data.name || 'Unnamed Chat'}"`
          )
        }

        // Set the conversation and clear the URL
        setCurrentConversation(conversationResponse.data)
        window.history.replaceState({}, '', '/')
      }
    } catch (error) {
      console.error('Failed to join conversation from URL:', error)
      showToast.error(
        'Failed to join conversation',
        'The conversation might not exist or you might not have permission to join.'
      )
      // Clear the URL on error
      window.history.replaceState({}, '', '/')
    } finally {
      setIsJoiningConversation(false)
    }
  }

  const handleJoinChat = (conversation: ConversationResponse) => {
    // For joining, we don't have the name yet, so we'll use a placeholder
    // In a real app, you'd fetch the conversation details from the API
    setCurrentConversation(conversation)
  }

  const handleBackToHome = () => {
    setCurrentConversation(null)
  }

  if (isLoading || isJoiningConversation) {
    return (
      <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
        <div className="h-[100svh] bg-background text-foreground flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p>
              {isJoiningConversation ? 'Joining conversation...' : 'Loading...'}
            </p>
          </div>
        </div>
        <Toaster />
      </ThemeProvider>
    )
  }

  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <div className="h-[100svh] bg-background text-foreground flex flex-col">
        <main className="flex-1 min-h-0">
          {currentConversation && user ? (
            <ChatPage
              conversation={currentConversation}
              user={user}
              onBackToHome={handleBackToHome}
              autoScroll={true}
            />
          ) : (
            <WelcomeScreen
              user={user}
              onLogin={() => setShowLogin(true)}
              onLogout={handleLogout}
              onJoinChat={handleJoinChat}
            />
          )}
        </main>

        <LoginDialog
          isOpen={showLogin}
          onClose={() => setShowLogin(false)}
          onLoginSuccess={handleLoginSuccess}
        />
      </div>
      <Toaster />
    </ThemeProvider>
  )
}

export default App
