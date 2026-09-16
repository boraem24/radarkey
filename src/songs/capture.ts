/** A short, explicitly requested upload. Tracks are released on every exit path. */
export async function captureSong(
  signal: AbortSignal,
  onSecond: (seconds: number) => void,
): Promise<Blob> {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined')
    throw Error(
      'Este navegador não suporta gravação. Use Chrome ou Safari atualizado em uma conexão HTTPS.',
    )
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true },
    video: false,
  })
  const release = () => stream.getTracks().forEach((t) => t.stop())
  if (signal.aborted) {
    release()
    throw new DOMException('Cancelado', 'AbortError')
  }
  try {
    const mimeType = [
      'audio/webm;codecs=opus',
      'audio/mp4',
      'audio/ogg;codecs=opus',
      'audio/webm',
    ].find((m) => MediaRecorder.isTypeSupported(m))
    const recorder = new MediaRecorder(
      stream,
      mimeType ? { mimeType, audioBitsPerSecond: 64000 } : undefined,
    )
    return await new Promise<Blob>((resolve, reject) => {
      const chunks: BlobPart[] = []
      let seconds = 0
      let settled = false
      const cleanup = () => {
        clearInterval(timer)
        signal.removeEventListener('abort', abort)
        document.removeEventListener('visibilitychange', visibility)
        release()
      }
      const fail = (error: Error) => {
        if (settled) return
        settled = true
        if (recorder.state !== 'inactive') recorder.stop()
        cleanup()
        reject(error)
      }
      const abort = () => fail(new DOMException('Cancelado', 'AbortError'))
      const visibility = () => {
        if (document.hidden) abort()
      }
      const timer = window.setInterval(() => {
        seconds++
        onSecond(seconds)
        if (seconds >= 12 && recorder.state !== 'inactive') recorder.stop()
      }, 1000)
      signal.addEventListener('abort', abort, { once: true })
      document.addEventListener('visibilitychange', visibility)
      stream
        .getAudioTracks()
        .forEach((track) =>
          track.addEventListener(
            'ended',
            () => fail(Error('O microfone foi interrompido. Tente novamente.')),
            { once: true },
          ),
        )
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data)
      }
      recorder.onerror = () => fail(Error('Não foi possível gravar o trecho. Tente novamente.'))
      recorder.onstop = () => {
        if (settled) return
        settled = true
        cleanup()
        resolve(new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' }))
      }
      onSecond(0)
      try {
        recorder.start()
      } catch (error) {
        fail(error instanceof Error ? error : Error('Não foi possível iniciar a gravação.'))
      }
    })
  } finally {
    release()
  }
}
