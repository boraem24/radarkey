export async function openMicrophone() {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
    throw new DOMException(
      'Abra o aplicativo em HTTPS ou localhost em um navegador atualizado.',
      'NotSupportedError',
    )
  return navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: { ideal: 1 },
      // Let the phone's voice path lift a distant singer before pitch analysis.
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: false,
  })
}
export function microphoneError(error: unknown) {
  const name = error instanceof Error ? error.name : ''
  const messages: Record<string, string> = {
    NotAllowedError:
      'Microfone não autorizado. Permita o acesso nas configurações deste site e tente novamente.',
    NotFoundError: 'Nenhum microfone disponível neste aparelho.',
    NotReadableError:
      'O microfone está ocupado ou indisponível. Feche outros aplicativos e tente novamente.',
    NotSupportedError: 'Use HTTPS e um navegador atualizado para acessar o microfone.',
    SecurityError: 'O navegador bloqueou o microfone. Verifique as permissões do site.',
  }
  return {
    state:
      name === 'NotAllowedError'
        ? 'permissionDenied'
        : name === 'NotSupportedError'
          ? 'unsupported'
          : 'error',
    message: messages[name] || 'Não foi possível iniciar o áudio. Tente novamente.',
  }
}
