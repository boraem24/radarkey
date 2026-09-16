// YIN: difference function + cumulative mean normalized difference + parabolic refinement.
// 4096 samples, 60–1100 Hz, 20 frames/s. Runs off the React thread.
export function detectPitch(data: Float32Array, sampleRate: number) {
  let energy = 0,
    peak = 0,
    mean = 0
  for (const x of data) mean += x
  mean /= data.length
  for (const x of data) {
    energy += (x - mean) ** 2
    peak = Math.max(peak, Math.abs(x))
  }
  const rms = Math.sqrt(energy / data.length)
  if (rms < 0.0015 || peak >= 0.995) return { frequency: 0, confidence: 0, rms, peak }
  const maxTau = Math.min(Math.floor(sampleRate / 60), Math.floor(data.length / 2) - 1)
  const minTau = Math.max(2, Math.floor(sampleRate / 1100)),
    size = data.length - maxTau
  const diff = new Float32Array(maxTau + 1)
  let cumulative = 0
  diff[0] = 1
  for (let tau = 1; tau <= maxTau; tau++) {
    let sum = 0
    for (let i = 0; i < size; i++) {
      const d = data[i] - data[i + tau]
      sum += d * d
    }
    cumulative += sum
    diff[tau] = cumulative ? (sum * tau) / cumulative : 1
  }
  let tau = minTau
  for (; tau < maxTau; tau++)
    if (diff[tau] < 0.15) {
      while (tau + 1 < maxTau && diff[tau + 1] < diff[tau]) tau++
      break
    }
  if (tau >= maxTau) return { frequency: 0, confidence: 0, rms, peak }
  const a = diff[tau - 1],
    b = diff[tau],
    c = diff[tau + 1],
    denominator = 2 * (2 * b - c - a)
  const refined = tau + (denominator ? (c - a) / denominator : 0)
  return { frequency: sampleRate / refined, confidence: Math.max(0, Math.min(1, 1 - b)), rms, peak }
}
