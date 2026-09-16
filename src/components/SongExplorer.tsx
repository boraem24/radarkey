import { useEffect, useRef, useState } from 'react'
import type { ChartVersion, MusicCapabilities, SongCandidate, SongChart } from '../songs/types'
import { musicRequest } from '../songs/api'
import { captureSong } from '../songs/capture'
import { loadCharts, saveCharts, searchLibrary } from '../songs/library'
import { transposeChord } from '../songs/charts'
import './SongExplorer.css'
const NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
type ChartResponse = { chart: SongChart; versions: ChartVersion[] }
export function SongExplorer({
  detectedKey,
  initialUrl,
  onClose,
  onChartChange,
}: {
  detectedKey: number | undefined
  initialUrl?: string
  onClose: () => void
  onChartChange?: (chart: SongChart) => void
}) {
  const [capabilities, setCapabilities] = useState<MusicCapabilities | null>(null)
  const [query, setQuery] = useState(''),
    [mode, setMode] = useState<'title' | 'lyrics'>('title')
  const [songs, setSongs] = useState<SongCandidate[]>([]),
    [searched, setSearched] = useState(false)
  const [stage, setStage] = useState<'search' | 'versions' | 'reader'>('search')
  const [chart, setChart] = useState<SongChart | null>(null),
    [versions, setVersions] = useState<ChartVersion[]>([])
  const [busy, setBusy] = useState(''),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('')
  const [seconds, setSeconds] = useState(-1),
    [saved, setSaved] = useState(loadCharts)
  const [target, setTarget] = useState<number | null>(null),
    [original, setOriginal] = useState(true)
  const [large, setLarge] = useState(false),
    [sectionIndex, setSectionIndex] = useState(0)
  const operation = useRef<AbortController | null>(null),
    heading = useRef<HTMLHeadingElement>(null)
  const sections = useRef<(HTMLElement | null)[]>([])
  useEffect(() => {
    const pause = () => {
      if (!document.hidden) return
      operation.current?.abort()
      operation.current = null
      setBusy('')
      setSeconds(-1)
    }
    document.addEventListener('visibilitychange', pause)
    return () => document.removeEventListener('visibilitychange', pause)
  }, [])
  useEffect(() => {
    const c = new AbortController()
    void musicRequest<MusicCapabilities>('status', c.signal)
      .then(setCapabilities)
      .catch(() => {
        if (!c.signal.aborted)
          setNotice('Sem conexão com o catálogo. Suas cifras salvas continuam disponíveis.')
      })
    return () => {
      c.abort()
      operation.current?.abort()
    }
  }, [])
  useEffect(() => {
    heading.current?.focus()
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [stage])
  const begin = (message: string) => {
    operation.current?.abort()
    const c = new AbortController()
    operation.current = c
    setBusy(message)
    setError('')
    setNotice('')
    return c
  }
  const failure = (e: unknown, c: AbortController) => {
    if (c.signal.aborted) return
    setError(
      e instanceof Error
        ? e.name === 'NotAllowedError'
          ? 'Permita o microfone no navegador para reconhecer o canto.'
          : e.message
        : 'Não foi possível concluir. Tente novamente.',
    )
  }
  const finish = (c: AbortController) => {
    if (operation.current === c) {
      setBusy('')
      setSeconds(-1)
    }
  }
  const cancel = () => {
    operation.current?.abort()
    operation.current = null
    setBusy('')
    setSeconds(-1)
  }
  const prepareChart = (result: ChartResponse) => {
    setChart(result.chart)
    onChartChange?.(result.chart)
    setVersions(result.versions)
    setOriginal(true)
    setTarget(
      result.chart.originalKey === null
        ? null
        : (result.chart.originalKey + result.chart.capo) % 12,
    )
    setSectionIndex(0)
  }
  const fetchChart = async (url: string, read = false) => {
    const c = begin('Lendo os acordes da cifra…')
    try {
      const result = await musicRequest<ChartResponse>(
        `chart?url=${encodeURIComponent(url)}`,
        c.signal,
      )
      if (c.signal.aborted) return
      prepareChart(result)
      setStage(read ? 'reader' : 'versions')
    } catch (e) {
      failure(e, c)
    } finally {
      finish(c)
    }
  }
  useEffect(() => {
    if (initialUrl) queueMicrotask(() => void fetchChart(initialUrl, true))
  }, [initialUrl])
  const search = async (text = query, searchMode = mode) => {
    const q = text.trim()
    if (q.length < 2) {
      setError('Digite o nome da música, um trecho ou o link da cifra.')
      return
    }
    if (/^https?:\/\//i.test(q)) {
      await fetchChart(q)
      return
    }
    const c = begin(
      searchMode === 'lyrics'
        ? 'Procurando a música pela letra…'
        : 'Buscando versões no Cifra Club…',
    )
    setStage('search')
    setSongs([])
    setSearched(false)
    try {
      const result = await musicRequest<{ songs: SongCandidate[] }>(
        `search?q=${encodeURIComponent(q)}&mode=${searchMode}`,
        c.signal,
      )
      if (c.signal.aborted) return
      setSongs(result.songs)
      setSearched(true)
    } catch (e) {
      failure(e, c)
    } finally {
      finish(c)
    }
  }
  const identify = async () => {
    const c = begin('Aguardando o microfone…')
    setSongs([])
    setSearched(false)
    try {
      const blob = await captureSong(c.signal, (s) => {
        setSeconds(s)
        setBusy('Cante o trecho que você lembra')
      })
      if (c.signal.aborted) return
      setSeconds(-1)
      setBusy('Identificando sua música…')
      const result = await musicRequest<{ songs: SongCandidate[] }>('recognize', c.signal, {
        method: 'POST',
        body: blob,
        headers: { 'Content-Type': blob.type },
      })
      if (c.signal.aborted) return
      setSongs(result.songs)
      setSearched(true)
      setNotice(
        result.songs.length
          ? 'Possíveis músicas encontradas. Confirme uma para procurar as versões no Cifra Club.'
          : 'Não reconhecemos este trecho. Tente um refrão mais longo ou busque pelo nome.',
      )
    } catch (e) {
      failure(e, c)
    } finally {
      finish(c)
    }
  }
  const chooseSong = (song: SongCandidate) => {
    if (song.source === 'cifraclub' && song.sourceUrl) void fetchChart(song.sourceUrl)
    else {
      setQuery(song.title)
      setMode('title')
      void search(song.title, 'title')
    }
  }
  const openSaved = (item: SongChart) => {
    cancel()
    setError('')
    setNotice('')
    prepareChart({ chart: item, versions: [] })
    setStage('reader')
  }
  const toggleSave = () => {
    if (!chart) return
    try {
      const exists = saved.some((c) => c.id === chart.id)
      const next = exists
        ? saved.filter((c) => c.id !== chart.id)
        : [{ ...chart, savedAt: Date.now() }, ...saved]
      saveCharts(next)
      setSaved(next)
      setNotice(
        exists
          ? 'Cifra removida do repertório.'
          : 'Cifra salva neste aparelho. Disponível mesmo sem internet.',
      )
    } catch (e) {
      setError((e as Error).message)
    }
  }
  const goSection = (index: number) => {
    setSectionIndex(index)
    sections.current[index]?.scrollIntoView({
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      block: 'start',
    })
  }
  const visibleSaved = searchLibrary(saved, query)
  const savedCurrent = chart && saved.some((c) => c.id === chart.id)
  const shift =
    chart && chart.originalKey !== null && !original && target !== null
      ? target - chart.originalKey
      : 0
  return (
    <div className="song-explorer">
      <div className="song-topbar">
        <button
          className="song-back"
          onClick={() => {
            cancel()
            setError('')
            setNotice('')
            if (stage === 'reader' && versions.length) setStage('versions')
            else if (stage !== 'search') setStage('search')
            else onClose()
          }}
        >
          ←{' '}
          {stage === 'search'
            ? 'Voltar ao tom'
            : stage === 'reader' && versions.length
              ? 'Versões'
              : 'Buscar música'}
        </button>
        <span className="song-wordmark">
          KEYRADAR <b>REPERTÓRIO</b>
        </span>
      </div>
      <div className="song-heading">
        <span className="eyebrow">
          {stage === 'search'
            ? 'DA SUA VOZ À MÚSICA'
            : stage === 'versions'
              ? 'ESCOLHA COMO TOCAR'
              : 'SUA MÚSICA. NO SEU TOM.'}
        </span>
        <h1 ref={heading} tabIndex={-1}>
          {stage === 'search' ? 'Qual é a música?' : chart?.song.title}
        </h1>
        <p>
          {stage === 'search' ? 'Encontre a versão. Leve os acordes com você.' : chart?.song.artist}
        </p>
      </div>
      {error && (
        <div className="song-alert" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <p className="song-notice" role="status">
          {notice}
        </p>
      )}
      {stage === 'search' && (
        <>
          <section className="song-recognize" aria-label="Reconhecimento por canto">
            <div className={`song-orb ${seconds >= 0 ? 'recording' : ''}`} aria-hidden="true">
              {seconds >= 0 ? (
                <span>
                  {12 - seconds}
                  <small>s</small>
                </span>
              ) : (
                '♫'
              )}
            </div>
            <div>
              <h2>{seconds >= 0 ? 'Estou ouvindo você' : 'Lembra como ela soa?'}</h2>
              <p>
                {seconds >= 0
                  ? 'Cante uma frase contínua, perto do microfone.'
                  : capabilities?.recognition
                    ? 'Cante por 12 segundos para encontrar possíveis músicas.'
                    : 'O reconhecimento por canto será ativado após configurar a ACRCloud.'}
              </p>
            </div>
            <button
              className="song-primary"
              disabled={!capabilities?.recognition || !!busy}
              onClick={() => void identify()}
            >
              Reconhecer cantando <span>↗</span>
            </button>
            <small className="song-privacy">
              Ao reconhecer, um trecho de até 12 s é enviado à ACRCloud. O KeyRadar não salva a
              gravação.
            </small>
          </section>
          <section className="song-search-box" aria-label="Buscar música">
            <div className="song-tabs" role="group" aria-label="Tipo de busca">
              <button
                aria-pressed={mode === 'title'}
                onClick={() => {
                  setMode('title')
                  setSearched(false)
                  setSongs([])
                }}
                disabled={!!busy}
              >
                Nome ou link
              </button>
              <button
                aria-pressed={mode === 'lyrics'}
                onClick={() => {
                  setMode('lyrics')
                  setSearched(false)
                  setSongs([])
                }}
                disabled={!!busy}
              >
                Trecho da letra
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                void search()
              }}
            >
              <label htmlFor="song-query">
                {mode === 'title'
                  ? 'Nome da música, artista ou link do Cifra Club'
                  : 'Digite o trecho da letra que você lembra'}
              </label>
              <div className="song-input-row">
                <input
                  id="song-query"
                  type="search"
                  maxLength={200}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={mode === 'title' ? 'Ex.: Bondade de Deus' : 'Uma frase da música…'}
                  autoComplete="off"
                  disabled={!!busy}
                />
                <button
                  className="song-primary"
                  disabled={
                    !!busy ||
                    query.trim().length < 2 ||
                    (mode === 'lyrics' && !capabilities?.lyrics)
                  }
                >
                  Buscar
                </button>
              </div>
            </form>
            <p className="song-helper">
              {mode === 'lyrics' && !capabilities?.lyrics
                ? 'A busca gratuita por letra está indisponível agora. A busca por nome e link usa o Cifra Club.'
                : 'Resultados do catálogo. Você confirma o artista e o arranjo antes de tocar.'}
            </p>
          </section>
          {!!songs.length && (
            <section className="song-results" aria-label="Versões encontradas">
              <div className="song-section-title">
                <h2>
                  {songs[0].source === 'cifraclub' ? 'Escolha a versão' : 'Esta é a sua música?'}
                </h2>
                <span>{songs.length} opções</span>
              </div>
              <div className="song-result-list">
                {songs.map((song, i) => (
                  <button
                    className="song-result"
                    key={song.id}
                    onClick={() => chooseSong(song)}
                    disabled={!!busy}
                  >
                    <span className="song-result-number">{String(i + 1).padStart(2, '0')}</span>
                    <span className="song-result-text">
                      <strong>{song.title}</strong>
                      <span>{song.artist}</span>
                    </span>
                    <span aria-hidden="true">↗</span>
                  </button>
                ))}
              </div>
            </section>
          )}
          {searched && !songs.length && !busy && !notice && (
            <div className="song-empty">
              <h2>Nenhuma música encontrada</h2>
              <p>
                Tente apenas o título, acrescente o artista ou cole o link da cifra do Cifra Club.
              </p>
            </div>
          )}
          <section className="song-library" aria-label="Meu repertório">
            <div className="song-section-title">
              <h2>Meu repertório</h2>
              <span>{saved.length} salvas</span>
            </div>
            {visibleSaved.length ? (
              <div className="song-result-list">
                {visibleSaved.map((item) => (
                  <button key={item.id} className="song-result" onClick={() => openSaved(item)}>
                    <span className="saved-icon" aria-hidden="true">
                      ♧
                    </span>
                    <span className="song-result-text">
                      <strong>{item.song.title}</strong>
                      <span>
                        {item.song.artist} · {item.name}
                      </span>
                    </span>
                    <span>→</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="song-helper">
                {saved.length
                  ? 'Nenhuma cifra salva corresponde à busca.'
                  : 'Suas cifras favoritas ficam aqui. Abra uma versão e toque em Salvar cifra.'}
              </p>
            )}
          </section>
        </>
      )}
      {stage === 'versions' && chart && (
        <section className="song-arrangements">
          <div className="song-section-title">
            <h2>Qual arranjo você prefere?</h2>
            <a href={chart.sourceUrl} target="_blank" rel="noopener noreferrer">
              Cifra Club ↗
            </a>
          </div>
          <p className="song-helper">
            Escolha uma cifra deste artista. Os acordes serão carregados diretamente da versão
            selecionada.
          </p>
          {versions.map((v) => (
            <button
              key={v.url}
              className="song-arrangement"
              disabled={!!busy}
              onClick={() => {
                if (v.url === chart.sourceUrl) {
                  setStage('reader')
                  setError('')
                  setNotice('')
                } else void fetchChart(v.url, true)
              }}
            >
              <span>
                <strong>{v.name}</strong>
                <small>
                  {v.url === chart.sourceUrl
                    ? `${chart.sections.length} partes · ${chart.originalKey === null ? 'Tom não informado' : `Acordes em ${NAMES[chart.originalKey]}`}${chart.capo ? ` · Capo ${chart.capo}` : ''}`
                    : 'Carregar acordes desta versão'}
                </small>
              </span>
              <span>→</span>
            </button>
          ))}
          <button
            className="song-text-button"
            onClick={() => {
              setStage('search')
              setQuery(chart.song.title)
              void search(chart.song.title, 'title')
            }}
            disabled={!!busy}
          >
            Escolher outro artista
          </button>
        </section>
      )}
      {stage === 'reader' && chart && (
        <>
          <div className="song-reader-meta">
            <span>{chart.name} · Cifra Club</span>
            <button className="song-save" onClick={toggleSave} aria-pressed={!!savedCurrent}>
              {savedCurrent ? '✓ Salva neste aparelho' : '+ Salvar cifra'}
            </button>
          </div>
          <section className="song-transpose" aria-label="Transpor acordes">
            <div>
              <span className="song-mini-label">
                {original ? 'ACORDES DA CIFRA' : 'TOCAR SEM CAPOTRASTE'}
              </span>
              <strong>
                {original
                  ? chart.originalKey === null
                    ? '—'
                    : NAMES[chart.originalKey]
                  : target === null
                    ? '—'
                    : NAMES[target]}
              </strong>
              <small>
                {original
                  ? chart.capo
                    ? `Capo ${chart.capo} · soa em ${chart.originalKey === null ? 'tom não informado' : NAMES[(chart.originalKey + chart.capo) % 12]}`
                    : 'Sem capotraste'
                  : 'Acordes transpostos'}
              </small>
            </div>
            <div className="song-key-controls">
              <label htmlFor="song-target">Tom para tocar</label>
              <select
                id="song-target"
                value={original ? 'original' : (target ?? '')}
                disabled={chart.originalKey === null}
                onChange={(e) => {
                  if (e.target.value === 'original') {
                    setOriginal(true)
                    setTarget(
                      chart.originalKey === null ? null : (chart.originalKey + chart.capo) % 12,
                    )
                    return
                  }
                  setTarget(Number(e.target.value))
                  setOriginal(false)
                }}
              >
                <option value="original">Original</option>
                {NAMES.map((n, i) => (
                  <option key={n} value={i}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <div className="song-key-actions">
              {detectedKey !== undefined && chart.originalKey !== null && (
                <button
                  onClick={() => {
                    setTarget(detectedKey)
                    setOriginal(false)
                  }}
                >
                  Usar tom detectado · {NAMES[detectedKey]}
                </button>
              )}
              <button
                onClick={() => {
                  setOriginal(true)
                  setTarget(
                    chart.originalKey === null ? null : (chart.originalKey + chart.capo) % 12,
                  )
                }}
                disabled={original}
              >
                Restaurar cifra original
              </button>
            </div>
          </section>
          {chart.originalKey === null && (
            <p className="song-helper">
              O catálogo não informou o tom dos acordes. Mantivemos a cifra original, sem
              transposição automática.
            </p>
          )}
          <div className="song-reader-toolbar">
            <span>
              {chart.sections.length} partes ·{' '}
              {new Set(chart.sections.flatMap((s) => s.lines.flat())).size} acordes diferentes
            </span>
            <button
              aria-pressed={large}
              onClick={() => setLarge(!large)}
              aria-label="Aumentar acordes"
            >
              A<span>A</span>
            </button>
          </div>
          <nav className="song-section-nav" aria-label="Partes da música">
            {chart.sections.map((s, i) => (
              <button
                key={s.id}
                aria-current={sectionIndex === i ? 'location' : undefined}
                onClick={() => goSection(i)}
              >
                {s.name}
              </button>
            ))}
          </nav>
          <div className={`song-chart ${large ? 'large' : ''}`} aria-label="Acordes da música">
            {chart.sections.map((s, i) => (
              <section
                key={s.id}
                ref={(el) => {
                  sections.current[i] = el
                }}
                className="song-chart-section"
              >
                <h2>
                  <span>{String(i + 1).padStart(2, '0')}</span>
                  {s.name}
                </h2>
                <div className="song-chord-lines">
                  {s.lines.map((line, j) => (
                    <div className="song-chord-line" key={j}>
                      {line.map((chord, k) => (
                        <span className="song-chord" key={k}>
                          {transposeChord(
                            chord,
                            shift,
                            target !== null && [1, 3, 5, 6, 8, 10].includes(target),
                          )}
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
          <div className="song-source">
            <strong>Fonte: Cifra Club</strong>
            <p>
              Acordes na ordem da cifra escolhida. As divisões preservam a estrutura publicada; não
              indicam duração nem acompanhamento automático.
            </p>
            <a href={chart.sourceUrl} target="_blank" rel="noopener noreferrer">
              Abrir cifra completa na fonte ↗
            </a>
          </div>
        </>
      )}
      {!!busy && (
        <div className="song-progress" role="status">
          <span className="song-spinner" aria-hidden="true" />
          <span>
            {busy}
            {seconds >= 0 && <small>{seconds} de 12 segundos</small>}
          </span>
          <button onClick={cancel}>Cancelar</button>
        </div>
      )}
    </div>
  )
}
