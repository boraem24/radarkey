import { readFile, writeFile } from 'node:fs/promises'
import { searchLyrics } from '../server/api.mjs'
const source = JSON.parse(await readFile(new URL('../artifacts/audit-louvores-2026-09-15.json', import.meta.url)))
const rows = source.rows.filter((row) => row.excerpt)
const levels = {
  perfeito: (s) => s,
  leve: (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
  moderado: (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/([aeiou])\1/g, '$1').replace(/\bque\b/gi, 'ke'),
  forte: (s) => s.split(/\s+/).map((word, i) => (i % 3 === 0 ? word.slice(0, Math.max(2, word.length - 2)) : word)).join(' '),
}
const normalize = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const matches = (want, got) => {
  const a = normalize(want), b = normalize(got)
  return a === b || a.includes(b) || b.includes(a) || a.split(' ').filter((word) => word.length > 3 && b.includes(word)).length >= Math.ceil(a.split(' ').length * .75)
}
const result = { generatedAt: new Date().toISOString(), total: rows.length, levels: {} }
for (const [level, mutate] of Object.entries(levels)) {
  const entries = []
  for (const row of rows) {
    try {
      const songs = await searchLyrics(mutate(row.excerpt), {}, fetch)
      entries.push({ title: row.title, excerpt: mutate(row.excerpt), top1: Boolean(songs[0] && matches(row.title, songs[0].title)), top5: songs.slice(0, 5).some((song) => matches(row.title, song.title)), hits: songs.slice(0, 5).map((song) => song.title) })
    } catch (error) {
      entries.push({ title: row.title, excerpt: mutate(row.excerpt), error: String(error.message || error) })
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  result.levels[level] = { top1: entries.filter((entry) => entry.top1).length, top5: entries.filter((entry) => entry.top5).length, errors: entries.filter((entry) => entry.error).length, entries }
  console.log(level, result.levels[level].top1, result.levels[level].top5, result.levels[level].errors)
}
await writeFile(new URL('../artifacts/benchmark-frases-corrompidas-2026-09-15.json', import.meta.url), JSON.stringify(result, null, 2), 'utf8')
await writeFile(new URL('../artifacts/benchmark-frases-corrompidas-2026-09-15.md', import.meta.url), `# Benchmark de frases corrompidas\n\nBase: ${rows.length} trechos reais da auditoria de 120 louvores.\n\n| Nível | Top-1 | Top-5 | Erros |\n| --- | ---: | ---: | ---: |\n${Object.entries(result.levels).map(([name, value]) => `| ${name} | ${value.top1} | ${value.top5} | ${value.errors} |`).join('\n')}\n\nCada nível aplica uma transformação determinística diferente à transcrição antes da busca pública. O resultado mede tolerância da busca textual, não reconhecimento de áudio.\n`, 'utf8')
