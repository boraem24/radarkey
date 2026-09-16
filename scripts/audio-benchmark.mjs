import { access, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
const manifestPath = process.argv[2] || 'audio-benchmark-manifest.json'
let manifest
try {
  manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
} catch {
  console.error(`Manifesto não encontrado: ${manifestPath}`)
  console.error('Copie artifacts/audio-benchmark-manifest.example.json e coloque gravações reais do celular.')
  process.exitCode = 2
  process.exit()
}
const rows = []
for (const item of manifest.recordings || []) {
  const file = join(process.cwd(), item.file)
  let present = true
  try { await access(file) } catch { present = false }
  rows.push({ ...item, file, present, transcription: null, identification: null, ttfh: null, ttfi: null, ttfc: null, note: present ? 'Arquivo pronto para ensaio pelo navegador/app.' : 'Arquivo ausente.' })
}
const result = { generatedAt: new Date().toISOString(), status: rows.length && rows.every((row) => row.present) ? 'ready-for-device-run' : 'missing-recordings', recordings: rows }
await writeFile('artifacts/audio-benchmark-results.json', JSON.stringify(result, null, 2), 'utf8')
await writeFile('artifacts/audio-benchmark-results.md', `# Benchmark de áudio real\n\nEstado: **${result.status}**.\n\nEste manifesto separa áudio → transcrição → música → seção. Os campos de latência (TTFH, TTFI, TTFC), WER, tom e seção só podem ser preenchidos durante uma gravação real no celular; nenhum resultado foi inventado.\n\nArquivos listados: ${rows.length}; presentes: ${rows.filter((row) => row.present).length}.\n`, 'utf8')
console.log(JSON.stringify({ status: result.status, total: rows.length, present: rows.filter((row) => row.present).length }))
