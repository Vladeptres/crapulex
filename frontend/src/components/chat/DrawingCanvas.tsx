import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Eraser, Redo2, Send, Trash2, Undo2 } from 'lucide-react'

interface DrawingCanvasProps {
  isOpen: boolean
  onClose: () => void
  onSend: (pngBlob: Blob) => void
  isSending?: boolean
}

const COLORS = [
  '#000000',
  '#FF4757',
  '#FF8C42',
  '#FFD32A',
  '#4ECDC4',
  '#3742FA',
  '#9B72CF',
  '#FF6B81',
  '#2ED573',
  '#FFFFFF',
]

const STROKE_WIDTHS = [2, 5, 10, 18]

export default function DrawingCanvas({
  isOpen,
  onClose,
  onSend,
  isSending = false,
}: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const isDrawingRef = useRef(false)
  const [color, setColor] = useState('#000000')
  const [strokeWidth, setStrokeWidth] = useState(5)
  const [isErasing, setIsErasing] = useState(false)
  const [history, setHistory] = useState<ImageData[]>([])
  const [redoStack, setRedoStack] = useState<ImageData[]>([])
  const [hasDrawn, setHasDrawn] = useState(false)

  const getContext = useCallback(() => {
    const canvas = canvasRef.current
    return canvas ? canvas.getContext('2d') : null
  }, [])

  // Size the canvas to its container and paint a white background
  useEffect(() => {
    if (!isOpen) return
    const timer = setTimeout(() => {
      const canvas = canvasRef.current
      const container = containerRef.current
      if (!canvas || !container) return
      canvas.width = container.clientWidth
      canvas.height = container.clientHeight
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.fillStyle = '#FFFFFF'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
      }
      setHistory([])
      setRedoStack([])
      setHasDrawn(false)
    }, 50)
    return () => clearTimeout(timer)
  }, [isOpen])

  const pushHistory = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = getContext()
    if (!canvas || !ctx) return
    const snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height)
    setHistory(prev => [...prev.slice(-24), snapshot])
    setRedoStack([])
  }, [getContext])

  const getPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    }
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = getContext()
    if (!ctx) return
    pushHistory()
    isDrawingRef.current = true
    setHasDrawn(true)
    const { x, y } = getPoint(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = isErasing ? '#FFFFFF' : color
    ctx.lineWidth = isErasing ? strokeWidth * 3 : strokeWidth
    // Draw a dot for single taps
    ctx.lineTo(x + 0.1, y + 0.1)
    ctx.stroke()
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return
    const ctx = getContext()
    if (!ctx) return
    const { x, y } = getPoint(e)
    ctx.lineTo(x, y)
    ctx.stroke()
  }

  const handlePointerUp = () => {
    isDrawingRef.current = false
  }

  const handleUndo = () => {
    const canvas = canvasRef.current
    const ctx = getContext()
    if (!canvas || !ctx || history.length === 0) return
    const current = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const previous = history[history.length - 1]
    setRedoStack(prev => [...prev, current])
    setHistory(prev => prev.slice(0, -1))
    ctx.putImageData(previous, 0, 0)
  }

  const handleRedo = () => {
    const canvas = canvasRef.current
    const ctx = getContext()
    if (!canvas || !ctx || redoStack.length === 0) return
    const current = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const next = redoStack[redoStack.length - 1]
    setHistory(prev => [...prev, current])
    setRedoStack(prev => prev.slice(0, -1))
    ctx.putImageData(next, 0, 0)
  }

  const handleClear = () => {
    const canvas = canvasRef.current
    const ctx = getContext()
    if (!canvas || !ctx) return
    pushHistory()
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    setHasDrawn(false)
  }

  const handleSend = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.toBlob(blob => {
      if (blob) {
        onSend(blob)
      }
    }, 'image/png')
  }

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-2xl w-[95vw] h-[85vh] flex flex-col gap-2 p-3">
        <DialogHeader className="p-0">
          <DialogTitle className="text-base">Draw the moment 🎨</DialogTitle>
        </DialogHeader>

        {/* Toolbar */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1">
            {COLORS.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  setColor(c)
                  setIsErasing(false)
                }}
                className={`w-6 h-6 rounded-full border-2 transition-transform ${
                  color === c && !isErasing
                    ? 'border-primary scale-110'
                    : 'border-muted'
                }`}
                style={{ backgroundColor: c }}
                aria-label={`Color ${c}`}
              />
            ))}
          </div>
          <div className="flex gap-1 items-center">
            {STROKE_WIDTHS.map(w => (
              <button
                key={w}
                type="button"
                onClick={() => setStrokeWidth(w)}
                className={`w-8 h-8 rounded flex items-center justify-center border ${
                  strokeWidth === w ? 'border-primary bg-muted' : 'border-transparent'
                }`}
                aria-label={`Stroke width ${w}`}
              >
                <span
                  className="rounded-full bg-foreground"
                  style={{ width: Math.min(w, 16), height: Math.min(w, 16) }}
                />
              </button>
            ))}
          </div>
          <Button
            type="button"
            size="sm"
            variant={isErasing ? 'default' : 'outline'}
            onClick={() => setIsErasing(prev => !prev)}
            className="h-8 w-8 p-0"
            title="Eraser"
          >
            <Eraser className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleUndo}
            disabled={history.length === 0}
            className="h-8 w-8 p-0"
            title="Undo"
          >
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleRedo}
            disabled={redoStack.length === 0}
            className="h-8 w-8 p-0"
            title="Redo"
          >
            <Redo2 className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleClear}
            className="h-8 w-8 p-0"
            title="Clear canvas"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        {/* Canvas */}
        <div
          ref={containerRef}
          className="flex-1 min-h-0 rounded-lg border overflow-hidden bg-white"
        >
          <canvas
            ref={canvasRef}
            className="w-full h-full touch-none cursor-crosshair"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSend}
            disabled={!hasDrawn || isSending}
            className="gradient-btn text-white"
          >
            <Send className="h-4 w-4 mr-2" />
            {isSending ? 'Sending...' : 'Send drawing'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
