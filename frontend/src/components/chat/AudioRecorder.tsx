import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Mic, Play, Pause, Square, Trash2, Send } from 'lucide-react'
import { useAudioRecorder } from '@/hooks/useAudioRecorder'
import { showToast } from '@/lib/toast'

interface AudioRecorderProps {
  onSendAudio: (audioBlob: Blob, duration: number) => void
  disabled?: boolean
  className?: string
}

export default function AudioRecorder({
  onSendAudio,
  disabled = false,
  className = '',
}: AudioRecorderProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(
    null
  )

  const {
    isRecording,
    isPaused,
    recordingTime,
    audioBlob,
    audioUrl,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    clearRecording,
  } = useAudioRecorder()

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const handleStartRecording = async () => {
    try {
      await startRecording()
    } catch (error) {
      showToast.error(
        'Recording failed',
        error instanceof Error ? error.message : 'Unknown error'
      )
    }
  }

  const handlePlayPause = () => {
    if (!audioUrl) return

    if (!audioElement) {
      const audio = new Audio(audioUrl)
      audio.onended = () => setIsPlaying(false)
      audio.onpause = () => setIsPlaying(false)
      audio.onplay = () => setIsPlaying(true)
      setAudioElement(audio)
      audio.play()
    } else {
      if (isPlaying) {
        audioElement.pause()
      } else {
        audioElement.play()
      }
    }
  }

  const handleSendAudio = () => {
    if (audioBlob) {
      onSendAudio(audioBlob, recordingTime)
      clearRecording()
      if (audioElement) {
        audioElement.pause()
        setAudioElement(null)
        setIsPlaying(false)
      }
    }
  }

  const handleClearRecording = () => {
    clearRecording()
    if (audioElement) {
      audioElement.pause()
      setAudioElement(null)
      setIsPlaying(false)
    }
  }

  // Recording state
  if (isRecording) {
    return (
      <div
        className={`flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg ${className}`}
      >
        <div className="flex items-center gap-2 flex-1">
          <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
          <span className="text-sm font-medium text-red-700 dark:text-red-300">
            Recording: {formatTime(recordingTime)}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {isPaused ? (
            <Button
              size="sm"
              variant="outline"
              onClick={resumeRecording}
              className="h-8 w-8 p-0"
            >
              <Play className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={pauseRecording}
              className="h-8 w-8 p-0"
            >
              <Pause className="h-4 w-4" />
            </Button>
          )}

          <Button
            size="sm"
            variant="outline"
            onClick={stopRecording}
            className="h-8 w-8 p-0"
          >
            <Square className="h-4 w-4" />
          </Button>
        </div>
      </div>
    )
  }

  // Playback state (after recording)
  if (audioBlob && audioUrl) {
    return (
      <div
        className={`flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg ${className}`}
      >
        <div className="flex items-center gap-2 flex-1">
          <Button
            size="sm"
            variant="outline"
            onClick={handlePlayPause}
            className="h-8 w-8 p-0"
          >
            {isPlaying ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </Button>

          <div className="flex flex-col">
            <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
              Audio recorded
            </span>
            <span className="text-xs text-blue-600 dark:text-blue-400">
              Duration: {formatTime(recordingTime)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            onClick={handleClearRecording}
            className="h-8 w-8 p-0"
          >
            <Trash2 className="h-4 w-4" />
          </Button>

          <Button
            size="sm"
            onClick={handleSendAudio}
            disabled={disabled}
            className="h-8 px-3 gradient-btn text-white"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    )
  }

  // Initial state (record button)
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={handleStartRecording}
      disabled={disabled}
      className={`h-9 w-9 p-0 ${className}`}
      title="Record audio message"
    >
      <Mic className="h-4 w-4" />
    </Button>
  )
}
