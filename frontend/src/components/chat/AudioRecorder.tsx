import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Mic, Square } from 'lucide-react'
import { useAudioRecorder } from '@/hooks/useAudioRecorder'
import { showToast } from '@/lib/toast'

interface AudioRecorderProps {
  onAudioRecorded: (audioBlob: Blob | null) => void
  onClear?: (clearFn: () => void) => void
  disabled?: boolean
  className?: string
  isRecording?: boolean
}

export default function AudioRecorder({
  onAudioRecorded,
  onClear,
  disabled = false,
  className = '',
}: AudioRecorderProps) {
  const {
    isRecording,
    audioBlob,
    startRecording,
    stopRecording,
    clearRecording,
  } = useAudioRecorder()

  useEffect(() => {
    if (audioBlob && !isRecording) {
      onAudioRecorded(audioBlob)
    }
  }, [audioBlob, isRecording, onAudioRecorded])

  useEffect(() => {
    if (onClear) {
      onClear(clearRecording)
    }
  }, [onClear, clearRecording])

  const handleToggleRecording = async () => {
    if (isRecording) {
      stopRecording()
    } else {
      try {
        await startRecording()
      } catch (error) {
        showToast.error(
          'Recording failed',
          error instanceof Error ? error.message : 'Unknown error'
        )
      }
    }
  }

  // Toggle button (record/stop)
  return (
    <Button
      size="sm"
      variant={isRecording ? 'destructive' : 'outline'}
      onClick={handleToggleRecording}
      disabled={disabled}
      className={`h-9 w-9 p-0 ${className} ${isRecording ? 'animate-pulse' : ''}`}
      title={isRecording ? 'Stop recording' : 'Record audio message'}
    >
      {isRecording ? (
        <Square className="h-4 w-4" />
      ) : (
        <Mic className="h-4 w-4" />
      )}
    </Button>
  )
}
