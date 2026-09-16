import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createHmac } from 'node:crypto'
import { chartUrl, parseCatalog, searchCatalog } from '../server/catalog.mjs'
import { capabilities, musicMiddleware, recognize, searchLyrics } from '../server/api.mjs'
const URL = 'https://www.cifraclub.com.br/artista-teste/cancao-teste/'
// Fictional fixture: no catalogue lyrics or complete real arrangements.
const html = `<script type="application/ld+json">{"@type":"MusicComposition","name":"Canção Teste"}</script><script type="application/ld+json">{"byArtist":{"name":"Artista Teste"}}</script><pre><div>[Intro] <b data-chord-name="F7M/C">F7M/C</b> <b>C4</b> (2x)\n\n[Refrão]\n<b>G/B</b> <b>Am7</b>\ntexto que nunca sai na resposta\n[Refrão]\n<b>C</b></div></pre><a href="/artista-teste/cancao-teste/simplificada.html">Simplificada</a><script>self.__next_f.push(${JSON.stringify([1, JSON.stringify({ config: { capo: 2, keyShape: 'C' } })])})</script>`
test('parser preserves sections, repeats, bass and extensions; excludes lyrics', () => {
  const { chart, versions } = parseCatalog(html, URL)
  assert.equal(chart.originalKey, 0)
  assert.equal(chart.capo, 2)
  assert.deepEqual(
    chart.sections.map((s) => s.name),
    ['Intro', 'Refrão', 'Refrão'],
  )
  assert.deepEqual(chart.sections[0].lines, [
    ['F7M/C', 'C4'],
    ['F7M/C', 'C4'],
  ])
  assert.deepEqual(chart.sections[1].lines, [['G/B', 'Am7']])
  assert.equal(versions[1].name, 'Simplificada')
  assert.equal(JSON.stringify(chart).includes('texto que nunca'), false)
})
test('unknown key stays unknown; unsupported notation does not silently disappear', () => {
  assert.equal(parseCatalog(html.replace('keyShape', 'otherKey'), URL).chart.originalKey, null)
  assert.throws(() => parseCatalog(html.replace('<b>C4</b>', '<b>Unknown</b>'), URL), /notação/)
  assert.throws(() => parseCatalog('<h1>Challenge</h1>', URL), /Não foi possível/)
})
test('URL allowlist rejects SSRF, alternate protocols and credentials', () => {
  for (const url of [
    'http://www.cifraclub.com.br/a/b/',
    'https://evil.test/a/b/',
    'https://www.cifraclub.com.br.evil.test/a/b/',
    'https://user:pass@www.cifraclub.com.br/a/b/',
    'https://www.cifraclub.com.br:8443/a/b/',
    'https://www.cifraclub.com.br/a/b/../../private',
    'https://www.cifraclub.com.br/a/b/%2fprivate',
  ])
    assert.throws(() => chartUrl(url))
  assert.equal(chartUrl(URL + '?utm_source=test'), URL)
})
test('search keeps songs and removes duplicates', async () => {
  const doc = {
    tipo: '2',
    art: 'Artista Teste',
    txt: 'Canção Teste',
    dns: 'artista-teste',
    url: 'cancao-teste',
  }
  const songs = await searchCatalog(
    'Canção',
    async () =>
      new Response(
        JSON.stringify({
          response: { docs: [doc, doc, { ...doc, tipo: '6' }, { ...doc, dns: '../../evil' }] },
        }),
      ),
  )
  assert.equal(songs.length, 1)
  assert.equal(songs[0].sourceUrl, URL)
})
test('free lyrics search is available without a key; recognition host is validated', () => {
  assert.deepEqual(capabilities({}), { catalog: true, lyrics: true, recognition: false })
  assert.equal(
    capabilities({
      ACRCLOUD_HOST: 'evil.test',
      ACRCLOUD_ACCESS_KEY: 'test',
      ACRCLOUD_ACCESS_SECRET: 'test',
    }).recognition,
    false,
  )
})
test('public lyric search keeps matching songs and ignores unrelated hits', async () => {
  const songs = await searchLyrics('Tua bondade me seguirá', {}, async (url) => {
    assert.equal(url.href, 'https://genius.com/api/search?q=Tua+bondade+me+seguir%C3%A1')
    return Response.json({
      meta: { status: 200 },
      response: {
        hits: [
          { type: 'song', matched_words: 4, result: { id: 1, title: 'Bondade de Deus', primary_artist: { name: 'Isaias Saad' }, lyrics: 'never returned' } },
          { type: 'song', matched_words: 4, result: { id: 2, title: 'Bondade de Deus', primary_artist: { name: 'Isaias Saad' } } },
          { type: 'song', matched_words: 1, result: { id: 3, title: 'Outro louvor', primary_artist: { name: 'Outra pessoa' } } },
        ],
      },
    })
  })
  assert.deepEqual(songs, [{ id: 'genius:1', title: 'Bondade de Deus', artist: 'Isaias Saad', source: 'genius' }])
})
test('ACRCloud signs actual sample and reads humming without invented confidence', async () => {
  const env = {
    ACRCLOUD_HOST: 'identify-test.acrcloud.com',
    ACRCLOUD_ACCESS_KEY: 'fake-key',
    ACRCLOUD_ACCESS_SECRET: 'fake-secret',
  }
  const result = await recognize(
    Buffer.from('fictional audio'),
    'audio/webm',
    env,
    async (url, options) => {
      assert.equal(url, 'https://identify-test.acrcloud.com/v1/identify')
      const body = options.body
      const expected = createHmac('sha1', 'fake-secret')
        .update(`POST\n/v1/identify\nfake-key\naudio\n1\n${body.get('timestamp')}`)
        .digest('base64')
      assert.equal(body.get('signature'), expected)
      assert.equal(body.get('sample_bytes'), '15')
      assert.equal(await body.get('sample').text(), 'fictional audio')
      return Response.json({
        status: { code: 0 },
        metadata: {
          humming: [{ title: 'Teste', artists: [{ name: 'Artista' }], score: '0.95', acrid: 'id' }],
        },
      })
    },
  )
  assert.equal(result[0].title, 'Teste')
  assert.equal('confidence' in result[0], false)
})
test('HTTP API hides secrets and rejects cross-origin recognition', async () => {
  const server = createServer(
    musicMiddleware({ ACRCLOUD_ACCESS_SECRET: 'never-visible' }, () => {
      throw Error('unexpected network')
    }),
  )
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const root = `http://127.0.0.1:${server.address().port}`
  try {
    const status = await fetch(root + '/api/music/status')
    assert.equal(status.headers.get('cache-control'), 'no-store')
    assert.equal((await status.text()).includes('never-visible'), false)
    const forbidden = await fetch(root + '/api/music/recognize', {
      method: 'POST',
      headers: { origin: 'https://evil.test' },
    })
    assert.equal(forbidden.status, 403)
    const unavailable = await fetch(root + '/api/music/recognize', {
      method: 'POST',
      headers: { origin: root },
    })
    assert.equal(unavailable.status, 503)
    const bad = await fetch(root + '/api/music/search?q=a')
    assert.equal(bad.status, 400)
  } finally {
    server.closeAllConnections()
    await new Promise((r) => server.close(r))
  }
})
