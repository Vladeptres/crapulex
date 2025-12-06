import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Download, Maximize2, X } from 'lucide-react'

interface PhotoDisplayProps {
  src: string
  alt?: string
  className?: string
  onDownload?: () => void
}

export default function PhotoDisplay({
  src,
  alt = 'Photo',
  className = '',
  onDownload,
}: PhotoDisplayProps) {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)

  const handleImageLoad = () => {
    setIsLoading(false)
  }

  const handleImageError = () => {
    setIsLoading(false)
    setHasError(true)
  }

  const handleFullscreen = () => {
    setIsFullscreen(true)
  }

  const handleCloseFullscreen = () => {
    setIsFullscreen(false)
  }

  const handleDownload = () => {
    if (onDownload) {
      onDownload()
    } else {
      // Default download behavior
      const link = document.createElement('a')
      link.href = src
      link.download = alt || 'photo'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    }
  }

  if (hasError) {
    return (
      <div
        className={`flex items-center justify-center w-64 h-48 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg ${className}`}
      >
        <div className="text-center text-gray-500 dark:text-gray-400">
          <div className="text-sm">Failed to load image</div>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className={`relative group max-w-sm ${className}`}>
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          </div>
        )}

        <img
          src={src}
          alt={alt}
          onLoad={handleImageLoad}
          onError={handleImageError}
          className={`w-full h-auto max-w-sm rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer transition-opacity ${
            isLoading ? 'opacity-0' : 'opacity-100'
          }`}
          onClick={handleFullscreen}
        />

        {!isLoading && (
          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
            <Button
              size="sm"
              variant="secondary"
              onClick={handleFullscreen}
              className="h-8 w-8 p-0 bg-black/50 hover:bg-black/70 text-white border-none"
              title="View fullscreen"
            >
              <Maximize2 className="h-4 w-4" />
            </Button>

            <Button
              size="sm"
              variant="secondary"
              onClick={handleDownload}
              className="h-8 w-8 p-0 bg-black/50 hover:bg-black/70 text-white border-none"
              title="Download image"
            >
              <Download className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Fullscreen modal */}
      {isFullscreen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="relative max-w-[90vw] max-h-[90vh]">
            <Button
              size="sm"
              variant="secondary"
              onClick={handleCloseFullscreen}
              className="absolute top-4 right-4 z-10 h-10 w-10 p-0 bg-black/50 hover:bg-black/70 text-white border-none"
              title="Close fullscreen"
            >
              <X className="h-5 w-5" />
            </Button>

            <img
              src={src}
              alt={alt}
              className="max-w-full max-h-full object-contain rounded-lg"
              onClick={handleCloseFullscreen}
            />
          </div>
        </div>
      )}
    </>
  )
}
