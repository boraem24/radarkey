import { detectPitch } from './pitchDetector'
// Half-rate analysis cuts the quadratic YIN work by about 4x while keeping the same time window.
export function analyzeSamples(samples: Float32Array, sampleRate: number) {
  if (sampleRate < 40000) return detectPitch(samples, sampleRate)
  const reduced = new Float32Array(Math.floor(samples.length / 2))
  let peak = 0,
    energy = 0
  for (let i = 0; i < samples.length; i++) {
    peak = Math.max(peak, Math.abs(samples[i]))
    energy += samples[i] ** 2
  }
  // Symmetric low-pass FIR before decimation; preserve original peak/RMS for signal diagnostics.
  for (let i = 0; i < reduced.length; i++) {
    const j = i * 2
    reduced[i] =
      ((samples[Math.max(0, j - 2)] ?? 0) +
        4 * samples[Math.max(0, j - 1)] +
        6 * samples[j] +
        4 * samples[Math.min(samples.length - 1, j + 1)] +
        samples[Math.min(samples.length - 1, j + 2)]) /
      16
  }
  const measurement = detectPitch(reduced, sampleRate / 2)
  return {
    ...measurement,
    peak,
    rms: Math.sqrt(energy / samples.length),
    ...(peak >= 0.995 ? { frequency: 0, confidence: 0 } : {}),
  }
}
