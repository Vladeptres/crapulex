import { useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Camera } from 'lucide-react'
import { showToast } from '@/lib/toast'

interface PhotoUploaderProps {
  onPhotoSelect: (photoFile: File | null) => void
  disabled?: boolean
  className?: string
}

export default function PhotoUploader({
  onPhotoSelect,
  disabled = false,
  className = '',
}: PhotoUploaderProps) {
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

    onPhotoSelect(file)
  }

  const handleCameraClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click()
    }
  }

  // Camera button
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
