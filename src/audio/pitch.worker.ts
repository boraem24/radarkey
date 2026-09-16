import { analyzeSamples } from './analyzeSamples'
import { PitchSmoother } from './pitchSmoother'
const smoother = new PitchSmoother()
self.onmessage = (
  event: MessageEvent<{ samples: Float32Array; sampleRate: number; timestamp: number }>,
) => {
  const { samples, sampleRate, timestamp } = event.data
  const measurement = analyzeSamples(samples, sampleRate)
  const pitch = smoother.push(measurement.frequency, measurement.confidence, timestamp)
  self.postMessage({ ...measurement, pitch, timestamp })
}
