export const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
export async function musicRequest<T>(
  path: string,
  signal: AbortSignal,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(`${API_BASE}/api/music/${path}`, { ...options, signal, cache: 'no-store' })
  if (!response.headers.get('content-type')?.includes('application/json'))
    throw Error(
      'O servidor de músicas não está disponível. Inicie o aplicativo pelo comando habitual e tente novamente.',
    )
  const result = await response.json()
  if (!response.ok) throw Error(result.error || 'Não foi possível concluir a solicitação.')
  return result as T
}
