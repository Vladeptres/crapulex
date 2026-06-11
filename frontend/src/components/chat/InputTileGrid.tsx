import { useRef } from 'react'
import { Camera, Mic, Paintbrush, Square } from 'lucide-react'
import { formatCooldown, type CooldownState } from '@/hooks/useCooldowns'

export type TileType = 'media' | 'voice' | 'drawing'

interface InputTileGridProps {
  cooldowns: CooldownState
  disabled?: boolean
  isRecording: boolean
  onPhotoSelect: (file: File) => void
  onVoiceToggle: () => void
  onDrawingOpen: () => void
}

const TILE_COLORS: Record<TileType, string> = {
  media: '#FF8C42',
  voice: '#9B72CF',
  drawing: '#4ECDC4',
}

interface TileProps {
  type: TileType
  label: string
  icon: React.ReactNode
  remaining: number
  disabled: boolean
  onClick: () => void
  pulse?: boolean
}

function Tile({ type, label, icon, remaining, disabled, onClick, pulse }: TileProps) {
  const onCooldown = remaining > 0
  const isDisabled = disabled || onCooldown
  return (
    <div className="flex flex-col items-center gap-1 flex-1">
      {/* Countdown above the tile */}
      <span
        className={`text-xs h-4 tabular-nums ${
          onCooldown ? 'text-muted-foreground' : 'text-transparent'
        }`}
      >
        {onCooldown ? formatCooldown(remaining) : '·'}
      </span>
      <button
        type="button"
        onClick={onClick}
        disabled={isDisabled}
        className={`w-full rounded-xl border-2 py-4 flex flex-col items-center gap-1.5 transition-all select-none ${
          isDisabled
            ? 'opacity-40 grayscale cursor-not-allowed bg-muted'
            : 'cursor-pointer hover:scale-[1.03] active:scale-95'
        } ${pulse ? 'animate-pulse' : ''}`}
        style={
          isDisabled
            ? undefined
            : {
                borderColor: TILE_COLORS[type],
                backgroundColor: `${TILE_COLORS[type]}1A`,
              }
        }
      >
        <span style={isDisabled ? undefined : { color: TILE_COLORS[type] }}>
          {icon}
        </span>
        <span className="text-xs font-medium">{label}</span>
      </button>
    </div>
  )
}

export default function InputTileGrid({
  cooldowns,
  disabled = false,
  isRecording,
  onPhotoSelect,
  onVoiceToggle,
  onDrawingOpen,
}: InputTileGridProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="flex gap-3 items-end">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) onPhotoSelect(file)
          e.target.value = ''
        }}
      />

      <Tile
        type="media"
        label="Photo / Video"
        icon={<Camera className="h-6 w-6" />}
        remaining={cooldowns.media}
        disabled={disabled}
        onClick={() => fileInputRef.current?.click()}
      />

      <Tile
        type="voice"
        label={isRecording ? 'Stop' : 'Voice'}
        icon={
          isRecording ? (
            <Square className="h-6 w-6" />
          ) : (
            <Mic className="h-6 w-6" />
          )
        }
        remaining={cooldowns.voice}
        disabled={disabled}
        onClick={onVoiceToggle}
        pulse={isRecording}
      />

      <Tile
        type="drawing"
        label="Drawing"
        icon={<Paintbrush className="h-6 w-6" />}
        remaining={cooldowns.drawing}
        disabled={disabled}
        onClick={onDrawingOpen}
      />
    </div>
  )
}
