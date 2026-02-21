import { useState } from 'react'
import { GoogleLogin, type CredentialResponse } from '@react-oauth/google'
import { Loader2 } from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { client } from '@/api/generated/client.gen'
import type { UserResponse } from '@/api/generated'

interface GoogleSignInButtonProps {
  onSuccess: (user: UserResponse) => void
}

export default function GoogleSignInButton({
  onSuccess,
}: GoogleSignInButtonProps) {
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleGoogleSuccess = async (
    credentialResponse: CredentialResponse
  ) => {
    if (!credentialResponse.credential) {
      setError('No credential received from Google')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const response = await client.post<{ data: UserResponse }>({
        url: '/google-auth/',
        body: { credential: credentialResponse.credential },
        headers: { 'Content-Type': 'application/json' },
        responseType: 'json',
      })

      if (response.data) {
        onSuccess(response.data as UserResponse)
      } else {
        setError('Google authentication failed. Please try again.')
      }
    } catch (err) {
      console.error('Google auth error:', err)
      setError('Google authentication failed. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleGoogleError = () => {
    setError('Google sign-in was cancelled or failed.')
  }

  return (
    <div className="flex flex-col items-center gap-2">
      {error && (
        <Alert variant="destructive" className="w-full">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 py-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm text-muted-foreground">
            Signing in with Google...
          </span>
        </div>
      ) : (
        <GoogleLogin
          onSuccess={handleGoogleSuccess}
          onError={handleGoogleError}
          theme="outline"
          size="large"
          width="100%"
          text="signin_with"
          shape="rectangular"
        />
      )}
    </div>
  )
}
