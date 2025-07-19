import {
  Heart,
  Star,
  Sparkles,
  Zap,
  Coffee,
  Beer,
  Music,
  Smile,
  Gift,
  Trophy,
  Rainbow,
  Moon,
  Sun,
} from 'lucide-react'

interface FunBackgroundProps {
  className?: string
}

export default function FunBackground({ className = '' }: FunBackgroundProps) {
  return (
    <div className={`absolute inset-0 pointer-events-none ${className}`}>
      {/* Top Row */}
      <Heart className="absolute top-4 left-4 h-8 w-8 text-muted-foreground/20 animate-pulse rotate-12 [animation-delay:0s]" />
      <Star className="absolute top-4 left-1/4 h-6 w-6 text-muted-foreground/30 animate-bounce -rotate-6 [animation-delay:0.5s]" />
      <Sparkles className="absolute top-4 left-1/2 h-5 w-5 text-muted-foreground/25 animate-pulse rotate-45 [animation-delay:1s]" />
      <Zap className="absolute top-4 left-3/4 h-9 w-9 text-muted-foreground/20 animate-pulse -rotate-12 [animation-delay:1.5s]" />
      <Coffee className="absolute top-4 right-4 h-7 w-7 text-muted-foreground/30 animate-bounce rotate-6 [animation-delay:2s]" />

      {/* Upper Middle Row */}
      <Beer className="absolute top-1/4 left-6 h-6 w-6 text-muted-foreground/25 animate-pulse -rotate-15 [animation-delay:0.3s]" />
      <Music className="absolute top-1/4 left-1/3 h-8 w-8 text-muted-foreground/30 animate-bounce rotate-8 [animation-delay:0.8s]" />
      <Smile className="absolute top-1/4 left-1/2 h-5 w-5 text-muted-foreground/25 animate-pulse -rotate-3 [animation-delay:1.3s]" />
      <Gift className="absolute top-1/4 left-2/3 h-9 w-9 text-muted-foreground/20 animate-bounce rotate-20 [animation-delay:1.8s]" />
      <Trophy className="absolute top-1/4 right-6 h-6 w-6 text-muted-foreground/30 animate-pulse -rotate-8 [animation-delay:2.3s]" />

      {/* Middle Row */}
      <Rainbow className="absolute top-1/3 left-8 h-10 w-10 text-muted-foreground/15 animate-pulse rotate-15 [animation-delay:0.2s]" />
      <Moon className="absolute top-1/3 left-1/4 h-8 w-8 text-muted-foreground/30 animate-bounce -rotate-12 [animation-delay:0.7s]" />
      <Sun className="absolute top-1/3 left-1/2 h-9 w-9 text-muted-foreground/20 animate-pulse rotate-25 [animation-delay:1.2s]" />
      <Heart className="absolute top-1/3 left-3/4 h-6 w-6 text-muted-foreground/25 animate-bounce -rotate-6 [animation-delay:1.7s]" />
      <Star className="absolute top-1/3 right-8 h-7 w-7 text-muted-foreground/30 animate-pulse rotate-10 [animation-delay:2.2s]" />

      {/* Center Row */}
      <Sparkles className="absolute top-1/2 left-4 h-6 w-6 text-muted-foreground/25 animate-pulse -rotate-20 [animation-delay:0.1s]" />
      <Zap className="absolute top-1/2 left-1/4 h-8 w-8 text-muted-foreground/20 animate-bounce rotate-5 [animation-delay:0.6s]" />
      <Coffee className="absolute top-1/2 left-1/2 h-5 w-5 text-muted-foreground/30 animate-pulse -rotate-10 [animation-delay:1.1s]" />
      <Beer className="absolute top-1/2 left-3/4 h-9 w-9 text-muted-foreground/25 animate-bounce rotate-18 [animation-delay:1.6s]" />
      <Music className="absolute top-1/2 right-4 h-6 w-6 text-muted-foreground/20 animate-pulse -rotate-15 [animation-delay:2.1s]" />

      {/* Lower Middle Row */}
      <Smile className="absolute top-2/3 left-6 h-7 w-7 text-muted-foreground/30 animate-bounce rotate-12 [animation-delay:0.4s]" />
      <Gift className="absolute top-2/3 left-1/3 h-6 w-6 text-muted-foreground/25 animate-pulse -rotate-8 [animation-delay:0.9s]" />
      <Trophy className="absolute top-2/3 left-1/2 h-5 w-5 text-muted-foreground/30 animate-bounce rotate-30 [animation-delay:1.4s]" />
      <Rainbow className="absolute top-2/3 left-2/3 h-10 w-10 text-muted-foreground/15 animate-pulse -rotate-18 [animation-delay:1.9s]" />
      <Moon className="absolute top-2/3 right-6 h-7 w-7 text-muted-foreground/25 animate-bounce rotate-6 [animation-delay:2.4s]" />

      {/* Bottom Row */}
      <Sun className="absolute bottom-4 left-4 h-9 w-9 text-muted-foreground/20 animate-pulse -rotate-12 [animation-delay:0.2s]" />
      <Heart className="absolute bottom-4 left-1/4 h-6 w-6 text-muted-foreground/30 animate-bounce rotate-15 [animation-delay:0.7s]" />
      <Star className="absolute bottom-4 left-1/2 h-7 w-7 text-muted-foreground/25 animate-pulse -rotate-5 [animation-delay:1.2s]" />
      <Sparkles className="absolute bottom-4 left-3/4 h-5 w-5 text-muted-foreground/30 animate-bounce rotate-25 [animation-delay:1.7s]" />
      <Zap className="absolute bottom-4 right-4 h-6 w-6 text-muted-foreground/20 animate-pulse -rotate-10 [animation-delay:2.2s]" />

      {/* Additional scattered icons for better coverage */}
      <Coffee className="absolute top-1/6 left-1/6 h-8 w-8 text-muted-foreground/25 animate-bounce rotate-8 [animation-delay:0.3s]" />
      <Beer className="absolute top-1/6 right-1/6 h-6 w-6 text-muted-foreground/30 animate-pulse -rotate-20 [animation-delay:0.8s]" />
      <Music className="absolute bottom-1/6 left-1/6 h-9 w-9 text-muted-foreground/20 animate-bounce rotate-12 [animation-delay:1.3s]" />
      <Smile className="absolute bottom-1/6 right-1/6 h-7 w-7 text-muted-foreground/25 animate-pulse -rotate-6 [animation-delay:1.8s]" />
      <Gift className="absolute top-5/6 left-1/3 h-6 w-6 text-muted-foreground/30 animate-bounce rotate-18 [animation-delay:2.3s]" />
      <Trophy className="absolute top-5/6 right-1/3 h-7 w-7 text-muted-foreground/25 animate-pulse -rotate-15 [animation-delay:2.8s]" />
    </div>
  )
}
