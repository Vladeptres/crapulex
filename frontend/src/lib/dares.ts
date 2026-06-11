/**
 * Party dares: random prompts rolled from the dice sticker on the note sheet.
 * They nudge people toward real night content instead of random filler —
 * each one is answerable with a note, photo, voice memo or drawing.
 */
const DARES: string[] = [
  'Draw the last thing you drank 🎨',
  'Photograph the most suspicious corner of the party 📸',
  'Describe the dance floor in exactly five words 💃',
  'Record yourself whispering the night’s biggest secret 🎙️',
  'Draw the face of the person who laughed the loudest 😂',
  'Write down the weirdest sentence you overheard tonight 👂',
  'Take a photo of someone’s shoes — no context allowed 👟',
  'Rate the music from 1 to 10 and defend your verdict 🎵',
  'Draw a map of the party from memory 🗺️',
  'Record your best impression of the DJ 🎧',
  'Describe what the kitchen looks like right now 🍕',
  'Write a haiku about the host 🌸',
  'Photograph the drink table before it gets worse 🍹',
  'Draw the night so far as a weather forecast ⛈️',
  'Record the room’s ambient sound for 10 seconds 🔊',
  'Write the name of tonight’s MVP and why 🏆',
  'Draw what you think will happen at 3am 🔮',
  'Describe the smell of the party in one sentence 👃',
  'Take a photo of the best outfit here 👗',
  'Write down the last thing that made you laugh 🤭',
  'Draw the host as a superhero 🦸',
  'Record yourself ordering an imaginary pizza 🍕',
  'Photograph the saddest snack on the table 🥨',
  'Write a one-line review of the bathroom situation 🚽',
  'Draw two guests as cartoon characters 🎭',
  'Describe your current energy level as a movie title 🎬',
  'Record a fake breaking-news report about this party 📰',
  'Write the wildest thing you’ve seen so far — no names 👀',
  'Draw the playlist’s vibe as an animal 🐆',
  'Photograph something that will make no sense tomorrow 🤔',
]

/** Roll a random dare, avoiding an immediate repeat. */
export function randomDare(current?: string | null): string {
  const pool = current ? DARES.filter(d => d !== current) : DARES
  return pool[Math.floor(Math.random() * pool.length)]
}
