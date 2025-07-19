import { registerSW } from 'virtual:pwa-register'
import { showToast } from '@/lib/toast'

const updateSW = registerSW({
  onNeedRefresh() {
    // Show a toast notification for new version
    showToast.info(
      '🎉 New version available!',
      'The app will reload automatically to update'
    )

    // Auto-reload after a short delay
    setTimeout(() => {
      updateSW(true)
    }, 2000)
  },
  onOfflineReady() {
    showToast.success(
      '🍺 Bourracho is ready offline!',
      'You can continue chatting even without internet'
    )
  },
  onRegistered(registration) {
    console.log('Service Worker registered successfully:', registration)
  },
  onRegisterError(error) {
    console.error('Service Worker registration error:', error)
    showToast.error(
      'Service Worker registration failed',
      'Some features may not work properly'
    )
  },
})

export default updateSW
