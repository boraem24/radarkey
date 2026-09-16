import { createHmac } from 'node:crypto'
import { loadEnv } from 'vite'
import { getChart, searchCatalog, fetchText } from './catalog.mjs'
export function capabilities(env) {
  return {
    catalog: true,
    lyrics: true,
    recognition: Boolean(
      env.ACRCLOUD_ACCESS_KEY &&
      env.ACRCLOUD_ACCESS_SECRET &&
      /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.acrcloud\.com$/.test(env.ACRCLOUD_HOST || ''),
    ),
  }
}
export async function recognize(sample, mime, env, fetcher = fetch) {
  if (!capabilities(env).recognition)
    throw Error(
      'O reconhecimento por canto ainda não está configurado. Busque pelo nome da música por enquanto.',
    )
  const timestamp = String(Math.floor(Date.now() / 1000))
  const signature = createHmac('sha1', env.ACRCLOUD_ACCESS_SECRET)
    .update(`POST\n/v1/identify\n${env.ACRCLOUD_ACCESS_KEY}\naudio\n1\n${timestamp}`)
    .digest('base64')
  const data = new FormData()
  const ext = mime.includes('mp4')
    ? 'mp4'
    : mime.includes('ogg')
      ? 'ogg'
      : mime.includes('wav')
        ? 'wav'
        : 'webm'
  data.set('sample', new Blob([sample], { type: mime }), `sample.${ext}`)
  for (const [key, value] of Object.entries({
    access_key: env.ACRCLOUD_ACCESS_KEY,
    sample_bytes: String(sample.length),
    timestamp,
    data_type: 'audio',
    signature_version: '1',
    signature,
  }))
    data.set(key, value)
  const response = await fetcher(`https://${env.ACRCLOUD_HOST}/v1/identify`, {
    method: 'POST',
    body: data,
    signal: AbortSignal.timeout(25000),
  })
  if (!response.ok) throw Error('O serviço de reconhecimento não respondeu. Tente novamente.')
  const result = await response.json()
  if (Number(result.status?.code) === 1001) return []
  if (Number(result.status?.code) !== 0)
    throw Error(
      'O serviço não conseguiu reconhecer. Confira a configuração e a modalidade de reconhecimento por canto.',
    )
  const items = [
    ...(result.metadata?.humming || [])
      .filter((item) => Number(item.score) >= 0.4)
      .map((item) => ({ ...item, recognitionScore: Number(item.score) })),
    ...(result.metadata?.music || [])
      .filter((item) => Number(item.score) >= 60)
      .map((item) => ({ ...item, recognitionScore: Number(item.score) / 100 })),
  ]
  const seen = new Set()
  return items
    .filter((v) => v.title && v.artists?.[0]?.name)
    .map((v, i) => ({
      id: String(v.acrid || i),
      title: String(v.title).slice(0, 180),
      artist: v.artists
        .map((a) => String(a.name))
        .join(', ')
        .slice(0, 180),
      source: 'acrcloud',
      recognitionScore: v.recognitionScore,
    }))
    .filter((v) => {
      const key = v.title + '|' + v.artist
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 5)
}
export async function searchLyrics(query, env, fetcher = fetch) {
  const url = new URL('https://genius.com/api/search')
  url.search = new URLSearchParams({ q: query }).toString()
  const result = JSON.parse(await fetchText(url, fetcher, 500000))
  if (result.meta?.status !== 200 || !Array.isArray(result.response?.hits))
    throw Error('A busca gratuita por letra não está disponível agora. Tente outra frase.')
  const seen = new Set()
  // Frases cantadas costumam chegar com erros de transcrição; exigir três palavras exatas
  // elimina músicas conhecidas quando só 2 de 6 coincidem.
  return result.response.hits
    .filter((hit) => hit.type === 'song' && Number(hit.matched_words || 0) >= 2)
    .map((hit) => hit.result)
    .filter((song) => song?.title && song?.primary_artist?.name)
    .map((song) => ({
      id: `genius:${song.id}`,
      title: String(song.title).slice(0, 180),
      artist: String(song.primary_artist.name).slice(0, 180),
      source: 'genius',
    }))
    .filter((song) => {
      const key = `${song.title.toLocaleLowerCase('pt-BR')}|${song.artist.toLocaleLowerCase('pt-BR')}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 12)
}
export function musicMiddleware(env, fetcher = fetch) {
  let recognitionCalls = []
  let requests = []
  let inFlight = 0
  return async (req, res, next) => {
    const url = new URL(req.url || '/', 'http://local')
    if (!url.pathname.startsWith('/api/music/')) return next()
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    const send = (status, data) => {
      res.statusCode = status
      res.end(JSON.stringify(data))
    }
    if (!['GET', 'POST'].includes(req.method)) return send(405, { error: 'Método não permitido.' })
    if (req.method === 'POST') {
      const origin = req.headers.origin
      let sameOrigin = false
      try {
        sameOrigin = Boolean(origin) && new URL(origin).host === req.headers.host
      } catch {
        /* invalid origin */
      }
      if (!sameOrigin || req.headers['sec-fetch-site'] === 'cross-site')
        return send(403, { error: 'Abra o reconhecimento pelo próprio aplicativo.' })
    }
    const now = Date.now()
    requests = requests.filter((t) => now - t < 60000)
    if (requests.length >= 90 || inFlight >= 6)
      return send(429, { error: 'Muitas solicitações. Aguarde alguns segundos e tente novamente.' })
    requests.push(now)
    inFlight++
    try {
      if (url.pathname === '/api/music/status' && req.method === 'GET')
        return send(200, capabilities(env))
      if (url.pathname === '/api/music/search' && req.method === 'GET') {
        const query = (url.searchParams.get('q') || '').trim()
        if (query.length < 2 || query.length > 200)
          return send(400, { error: 'Digite entre 2 e 200 caracteres.' })
        return send(200, {
          songs:
            url.searchParams.get('mode') === 'lyrics'
              ? await searchLyrics(query, env, fetcher)
              : await searchCatalog(query, fetcher),
        })
      }
      if (url.pathname === '/api/music/chart' && req.method === 'GET')
        return send(200, await getChart(url.searchParams.get('url') || '', fetcher))
      if (url.pathname === '/api/music/recognize' && req.method === 'POST') {
        if (!capabilities(env).recognition)
          return send(503, {
            error: 'Reconhecimento por canto aguardando configuração da ACRCloud.',
          })
        const mime = String(req.headers['content-type'] || '').split(';')[0]
        if (
          ![
            'audio/webm',
            'audio/ogg',
            'audio/mp4',
            'audio/wav',
            'video/webm',
            'video/mp4',
          ].includes(mime)
        )
          return send(415, { error: 'Formato de áudio não suportado neste navegador.' })
        recognitionCalls = recognitionCalls.filter((t) => now - t < 3600000)
        if (recognitionCalls.length >= 30)
          return send(429, {
            error: 'Limite de 30 reconhecimentos por hora atingido neste servidor.',
          })
        if (Number(req.headers['content-length']) > 2_000_000)
          return send(413, { error: 'Trecho de áudio muito grande.' })
        const chunks = []
        let bytes = 0
        const timer = setTimeout(() => req.destroy(), 15000)
        try {
          for await (const chunk of req) {
            bytes += chunk.length
            if (bytes > 2_000_000) {
              send(413, { error: 'Trecho de áudio muito grande.' })
              return
            }
            chunks.push(chunk)
          }
        } finally {
          clearTimeout(timer)
        }
        if (bytes < 1000)
          return send(400, { error: 'O trecho ficou curto demais. Cante por alguns segundos.' })
        recognitionCalls.push(now)
        return send(200, { songs: await recognize(Buffer.concat(chunks), mime, env, fetcher) })
      }
      return send(404, { error: 'Recurso não encontrado.' })
    } catch (error) {
      const message =
        error instanceof Error &&
        !['TypeError', 'TimeoutError', 'AbortError', 'SyntaxError'].includes(error.name)
          ? error.message
          : 'Não foi possível conectar ao serviço. Confira a internet e tente novamente.'
      if (!res.writableEnded) send(502, { error: message })
    } finally {
      inFlight--
    }
  }
}
export function musicApi() {
  let env = {}
  return {
    name: 'keyradar-music-api',
    configResolved(config) {
      env = { ...loadEnv(config.mode, config.root, ''), ...process.env }
    },
    configureServer(server) {
      server.middlewares.use(musicMiddleware(env))
    },
    configurePreviewServer(server) {
      server.middlewares.use(musicMiddleware(env))
    },
  }
}
