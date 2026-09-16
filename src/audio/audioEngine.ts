import { openMicrophone } from './microphone'
import type { Pitch } from '../music/notes'
export interface AudioFrame {
  frequency: number
  confidence: number
  rms: number
  peak: number
  pitch: Pitch | null
  timestamp: number
  sampleRate: number
  contextState: string
  latency: number
  processed: number
  discarded: number
}
export class AudioEngine {
  private context: AudioContext | null = null
  private stream: MediaStream | null = null
  private worker: Worker | null = null
  private timer = 0
  private recoveryTimer = 0
  private stopped = false
  private oscillator: OscillatorNode | null = null
  private processed = 0
  private discarded = 0
  private recorder: MediaRecorder | null = null
  private recorderTimer = 0
  private sampleCount = 0
  private samplesStopped = false
  async start(
    onFrame: (frame: AudioFrame) => void,
    onInterrupt: () => void,
    synthetic = false,
    onSample?: (sample: Blob) => void,
    onStream?: (track: MediaStreamTrack) => void,
  ) {
    if (
      typeof AudioContext === 'undefined' ||
      typeof Worker === 'undefined' ||
      !window.isSecureContext
    )
      throw new DOMException('Navegador incompatível ou contexto inseguro.', 'NotSupportedError')
    this.context = new AudioContext({ latencyHint: 'interactive' })
    await this.context.resume()
    if (this.stopped) return
    if (!synthetic) {
      const stream = await openMicrophone()
      if (this.stopped) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      this.stream = stream
      const speechTrack = stream.getAudioTracks()[0]
      // The callback runs only after getUserMedia returned a track. The UI
      // also receives a non-live track so it can expose the actual state
      // instead of showing an empty diagnostic panel; SpeechRecognition itself
      // is started only after useSession confirms readyState === 'live'.
      if (onStream && speechTrack) onStream(speechTrack)
      if (onSample && typeof MediaRecorder !== 'undefined') {
        const mimeType = [
          'audio/webm;codecs=opus',
          'audio/mp4',
          'audio/ogg;codecs=opus',
          'audio/webm',
        ].find((type) => MediaRecorder.isTypeSupported(type))
        const recordExcerpt = () => {
          if (this.stopped || this.samplesStopped || this.sampleCount >= 2) return
          const chunks: BlobPart[] = []
          const recorder = new MediaRecorder(
            stream,
            mimeType ? { mimeType, audioBitsPerSecond: 64000 } : undefined,
          )
          this.recorder = recorder
          recorder.ondataavailable = (event) => {
            if (event.data.size) chunks.push(event.data)
          }
          recorder.onstop = () => {
            window.clearTimeout(this.recorderTimer)
            if (this.stopped || this.samplesStopped) return
            this.sampleCount++
            if (chunks.length)
              onSample(new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' }))
            if (this.sampleCount < 2) recordExcerpt()
          }
          recorder.start()
          this.recorderTimer = window.setTimeout(() => {
            if (recorder.state === 'recording') recorder.stop()
          }, 10000)
        }
        recordExcerpt()
      }
    }
    const context = this.context
    if (context.state !== 'running') await context.resume()
    const analyser = context.createAnalyser()
    analyser.fftSize = 4096
    analyser.smoothingTimeConstant = 0
    if (synthetic) {
      this.oscillator = context.createOscillator()
      this.oscillator.frequency.value = 440
      const gain = context.createGain()
      gain.gain.value = 0.15
      this.oscillator.connect(gain).connect(analyser)
      this.oscillator.start()
    } else if (this.stream) {
      context.createMediaStreamSource(this.stream).connect(analyser)
      this.stream.getTracks().forEach((t) =>
        t.addEventListener('ended', () => {
          if (!this.stopped) onInterrupt()
        }),
      )
    }
    // Silent output keeps the graph active, without microphone feedback.
    const mute = context.createGain()
    mute.gain.value = 0
    analyser.connect(mute).connect(context.destination)
    let busy = false,
      sentAt = 0,
      workerRecoveries = 0
    const createWorker = () => {
      this.worker?.terminate()
      const worker = new Worker(new URL('./pitch.worker.ts', import.meta.url), { type: 'module' })
      this.worker = worker
      busy = false
      worker.onmessage = (e: MessageEvent) => {
        if (worker !== this.worker || this.stopped) return
        busy = false
        workerRecoveries = 0
        this.processed++
        onFrame({
          ...e.data,
          sampleRate: context.sampleRate,
          contextState: context.state,
          latency: (context.baseLatency + 4096 / context.sampleRate) * 1000,
          processed: this.processed,
          discarded: this.discarded,
        })
      }
      worker.onerror = () => {
        if (this.stopped || worker !== this.worker) return
        if (++workerRecoveries <= 2) createWorker()
        else onInterrupt()
      }
    }
    createWorker()
    context.onstatechange = () => {
      if (this.stopped) return
      if (context.state === 'running') {
        window.clearTimeout(this.recoveryTimer)
        this.recoveryTimer = 0
        return
      }
      if (context.state === 'closed') {
        onInterrupt()
        return
      }
      if (this.recoveryTimer) return
      // Mobile audio interruptions can be transient. Give resume a bounded opportunity.
      this.recoveryTimer = window.setTimeout(() => {
        this.recoveryTimer = 0
        if (!this.stopped && context.state !== 'running') onInterrupt()
      }, 2000)
      void context.resume().catch(() => {
        /* Timer offers the user a restart if a gesture is required. */
      })
    }
    this.timer = window.setInterval(() => {
      if (this.stopped || context.state !== 'running') return
      if (busy) {
        this.discarded++
        if (performance.now() - sentAt > 2000) {
          if (++workerRecoveries <= 2) createWorker()
          else {
            onInterrupt()
            return
          }
        } else return
      }
      busy = true
      sentAt = performance.now()
      const samples = new Float32Array(4096)
      analyser.getFloatTimeDomainData(samples)
      this.worker?.postMessage(
        { samples, sampleRate: context.sampleRate, timestamp: performance.now() },
        [samples.buffer],
      )
    }, 50)
  }
  setFrequency(hz: number) {
    if (this.oscillator && this.context)
      this.oscillator.frequency.setValueAtTime(hz, this.context.currentTime)
  }
  async suspendAnalysis() {
    if (this.context && this.context.state === 'running') await this.context.suspend()
  }
  async resumeAnalysis() {
    if (this.context && this.context.state === 'suspended') await this.context.resume()
  }
  stopSamples() {
    this.samplesStopped = true
    window.clearTimeout(this.recorderTimer)
    if (this.recorder?.state === 'recording') this.recorder.stop()
  }
  stop() {
    this.stopped = true
    window.clearInterval(this.timer)
    window.clearTimeout(this.recoveryTimer)
    window.clearTimeout(this.recorderTimer)
    if (this.recorder?.state === 'recording') this.recorder.stop()
    this.worker?.terminate()
    this.oscillator?.stop()
    this.stream?.getTracks().forEach((t) => t.stop())
    if (this.context && this.context.state !== 'closed') void this.context.close()
  }
}
