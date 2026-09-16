import type { SongCandidate } from './types'
import { normalize } from './library'
/** Scores are provider similarities, not calibrated probabilities. */
export function acousticDecision(
  current: SongCandidate[],
  previous: SongCandidate[],
  excerpt: number,
) {
  const strong = current.find(
    (song) => song.recognitionScore === undefined || song.recognitionScore >= 0.55,
  )
  if (strong) return strong
  if (excerpt < 2) return null
  return (
    current.find((song) =>
      previous.some(
        (older) =>
          normalize(older.title) === normalize(song.title) &&
          normalize(older.artist) === normalize(song.artist),
      ),
    ) || null
  )
}
