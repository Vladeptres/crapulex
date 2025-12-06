import { useState } from 'react'
import EmojiPicker from 'emoji-picker-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

interface EmojiPickerComponentProps {
  onSelect: (emoji: string) => void
  trigger?: React.ReactNode
}

export default function EmojiPickerComponent({
  onSelect,
  trigger,
}: EmojiPickerComponentProps) {
  const [isOpen, setIsOpen] = useState(false)

  const handleEmojiClick = (emojiData: any) => {
    onSelect(emojiData.emoji)
    setIsOpen(false)
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        className="w-auto p-0 z-[9999] pointer-events-auto"
        align="start"
        side="bottom"
        sideOffset={4}
        avoidCollisions={true}
        onInteractOutside={e => {
          // Only close if clicking outside the emoji picker
          const target = e.target as HTMLElement
          if (!target.closest('[data-radix-popper-content-wrapper]')) {
            setIsOpen(false)
          } else {
            e.preventDefault()
          }
        }}
        onPointerDownOutside={e => {
          // Prevent closing when clicking inside the picker
          const target = e.target as HTMLElement
          if (target.closest('[data-radix-popper-content-wrapper]')) {
            e.preventDefault()
          }
        }}
      >
        <div
          className="relative z-[10000] pointer-events-auto"
          onClick={e => e.stopPropagation()}
        >
          <EmojiPicker
            onEmojiClick={handleEmojiClick}
            width={350}
            height={400}
            previewConfig={{
              showPreview: false,
            }}
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}
