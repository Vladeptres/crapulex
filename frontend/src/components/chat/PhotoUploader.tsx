import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Camera, X, Send } from 'lucide-react'
import { showToast } from '@/lib/toast'

interface PhotoUploaderProps {
  onSendPhoto: (photoFile: File) => void
  disabled?: boolean
  className?: string
}

export default function PhotoUploader({
  onSendPhoto,
  disabled = false,
  className = '',
}: PhotoUploaderProps) {
  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      showToast.error('Invalid file type', 'Please select an image file')
      return
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024 // 10MB
    if (file.size > maxSize) {
      showToast.error(
        'File too large',
        'Please select an image smaller than 10MB'
      )
      return
    }

    setSelectedPhoto(file)

    // Create preview URL
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
  }

  const handleCameraClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click()
    }
  }

  const handleSendPhoto = () => {
    if (selectedPhoto) {
      onSendPhoto(selectedPhoto)
      clearPhoto()
    }
  }

  const clearPhoto = () => {
    setSelectedPhoto(null)
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
      setPreviewUrl(null)
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // Photo preview state (after selection)
  if (selectedPhoto && previewUrl) {
    return (
      <div
        className={`flex items-center gap-3 p-3 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg ${className}`}
      >
        <div className="flex items-center gap-3 flex-1">
          <div className="relative">
            <img
              src={previewUrl}
              alt="Selected photo"
              className="w-16 h-16 object-cover rounded-lg border border-green-300 dark:border-green-700"
            />
          </div>

          <div className="flex flex-col">
            <span className="text-sm font-medium text-green-700 dark:text-green-300">
              Photo selected
            </span>
            <span className="text-xs text-green-600 dark:text-green-400">
              {selectedPhoto.name} ({(selectedPhoto.size / 1024).toFixed(1)} KB)
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            onClick={clearPhoto}
            className="h-8 w-8 p-0"
            title="Remove photo"
          >
            <X className="h-4 w-4" />
          </Button>

          <Button
            size="sm"
            onClick={handleSendPhoto}
            disabled={disabled}
            className="h-8 px-3 gradient-btn text-white"
            title="Send photo"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    )
  }

  // Initial state (camera button)
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={handleCameraClick}
        disabled={disabled}
        className={`h-9 w-9 p-0 ${className}`}
        title="Upload photo"
      >
        <Camera className="h-4 w-4" />
      </Button>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />
    </>
  )
}
