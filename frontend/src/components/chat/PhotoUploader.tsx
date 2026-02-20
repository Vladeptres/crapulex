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

    // Validate file type - check both MIME type and extension for mobile compatibility
    const validImageExtensions = [
      '.jpg',
      '.jpeg',
      '.png',
      '.gif',
      '.bmp',
      '.webp',
      '.svg',
      '.heic',
      '.heif',
    ]
    const fileExtension = file.name
      .toLowerCase()
      .slice(file.name.lastIndexOf('.'))
    const isValidType =
      file.type.startsWith('image/') ||
      validImageExtensions.includes(fileExtension)
    if (!isValidType) {
      showToast.error('Invalid file type', 'Please select an image file')
      return
    }

    // Validate file size (max 25MB to support high-res mobile photos)
    const maxSize = 25 * 1024 * 1024 // 25MB
    if (file.size > maxSize) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(1)
      showToast.error(
        'File too large',
        `Photo is ${sizeMB}MB. Please select an image smaller than 25MB.`
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
        accept="image/*,image/heic,image/heif"
        capture="environment"
        onChange={handleFileSelect}
        className="hidden"
      />
    </>
  )
}
