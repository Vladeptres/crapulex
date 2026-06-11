import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface TimerWarningModalProps {
  isOpen: boolean
  onConfirm: (dontWarnAgain: boolean) => void
  onCancel: () => void
}

export default function TimerWarningModal({
  isOpen,
  onConfirm,
  onCancel,
}: TimerWarningModalProps) {
  const [dontWarnAgain, setDontWarnAgain] = useState(false)

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onCancel()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Hold on! ⏳</DialogTitle>
          <DialogDescription>
            You won't be able to send this type of message for 30 minutes.
            Make it count!
          </DialogDescription>
        </DialogHeader>

        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            checked={dontWarnAgain}
            onChange={e => setDontWarnAgain(e.target.checked)}
            className="h-4 w-4 accent-primary"
          />
          Don't warn me again
        </label>

        <DialogFooter className="flex-row justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => onConfirm(dontWarnAgain)}
            className="gradient-btn text-white"
          >
            OK, send it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
