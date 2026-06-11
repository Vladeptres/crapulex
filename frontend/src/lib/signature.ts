import type { MessageResponse } from '@/api/generated'

/** Simple deterministic string hash (djb2). */
export function hashString(str: string): number {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i)
  }
  return Math.abs(hash)
}

/**
 * Derive a user's signature pastel color from their emoji.
 * Hash of the emoji Unicode code point(s) -> HSL with S~40%, L~85%.
 */
export function pastelColorFromEmoji(emoji: string | null | undefined): string {
  if (!emoji) return 'hsl(0, 0%, 88%)'
  let codePointSum = 0
  for (const char of emoji) {
    codePointSum += char.codePointAt(0) ?? 0
  }
  const hue = hashString(String(codePointSum)) % 360
  return `hsl(${hue}, 40%, 85%)`
}

/** A slightly darker companion color (borders, dots). */
export function accentColorFromEmoji(emoji: string | null | undefined): string {
  if (!emoji) return 'hsl(0, 0%, 60%)'
  let codePointSum = 0
  for (const char of emoji) {
    codePointSum += char.codePointAt(0) ?? 0
  }
  const hue = hashString(String(codePointSum)) % 360
  return `hsl(${hue}, 45%, 60%)`
}

export type MessageKind = 'text' | 'media' | 'voice' | 'drawing'

/** Resolve a message's kind from its message_type field, falling back to media inference. */
export function getMessageKind(message: MessageResponse): MessageKind {
  const explicit = (message as { message_type?: MessageKind }).message_type
  if (explicit && ['text', 'media', 'voice', 'drawing'].includes(explicit)) {
    return explicit
  }
  const medias = message.medias_metadatas || []
  if (medias.some(m => m.type === 'audio')) return 'voice'
  if (medias.length > 0) return 'media'
  return 'text'
}

/** Timeline dot colors per message kind (from the sprint spec). */
export const TIMELINE_COLORS: Record<MessageKind, string> = {
  media: '#FF8C42',
  voice: '#9B72CF',
  drawing: '#4ECDC4',
  text: '#A0A0A0',
}
