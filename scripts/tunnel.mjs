import { extractTunnelUrl } from './tunnel-output.mjs'
import { stripVTControlCharacters } from 'node:util'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
const root = fileURLToPath(new URL('../', import.meta.url))
export async function cloudflareTunnel(port) {
  const windows = process.platform === 'win32',
    exe = path.join(root, 'tools', windows ? 'cloudflared.exe' : 'cloudflared')
  if (!existsSync(exe)) {
    if (!windows || process.arch !== 'x64')
      throw Error(
        'Instale cloudflared e coloque o executável na pasta tools. Este download automático atende Windows x64.',
      )
    console.log('Baixando cloudflared portátil oficial (sem instalação no sistema)...')
    const releaseResponse = await fetch(
      'https://api.github.com/repos/cloudflare/cloudflared/releases/latest',
      { signal: AbortSignal.timeout(60000) },
    )
    if (!releaseResponse.ok)
      throw Error(`Não foi possível consultar a versão oficial: ${releaseResponse.status}`)
    const release = await releaseResponse.json(),
      asset = release.assets.find((a) => a.name === 'cloudflared-windows-amd64.exe')
    if (!asset?.digest?.startsWith('sha256:'))
      throw Error('O release não forneceu SHA-256 para validar o download.')
    const response = await fetch(asset.browser_download_url, {
      signal: AbortSignal.timeout(180000),
    })
    if (!response.ok) throw Error(`Download falhou: ${response.status}`)
    const bytes = Buffer.from(await response.arrayBuffer()),
      digest = 'sha256:' + createHash('sha256').update(bytes).digest('hex')
    if (digest !== asset.digest) throw Error('O checksum do cloudflared não confere.')
    mkdirSync(path.dirname(exe), { recursive: true })
    writeFileSync(exe, bytes)
    writeFileSync(
      path.join(root, 'tools', 'cloudflared-version.json'),
      JSON.stringify({ version: release.tag_name, digest }, null, 2),
    )
  }
  const metadata = path.join(root, 'tools', 'cloudflared-version.json')
  if (existsSync(metadata)) {
    const { digest } = JSON.parse(readFileSync(metadata, 'utf8'))
    if ('sha256:' + createHash('sha256').update(readFileSync(exe)).digest('hex') !== digest)
      throw Error(
        'Executável cloudflared modificado. Remova-o e execute novamente para baixar a versão oficial.',
      )
  }
  const child = spawn(
    exe,
    ['tunnel', '--url', `http://127.0.0.1:${port}`, '--protocol', 'http2', '--no-autoupdate'],
    { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  let found = false,
    buffer = ''
  const output = (chunk) => {
    const value = chunk.toString()
    process.stdout.write(value)
    buffer = (buffer + value).slice(-12000)
    const url = buffer.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)
    if (url && url[0] !== 'https://api.trycloudflare.com' && !found) {
      found = true
      console.log(
        `\nABRA ESTE ENDEREÇO NO CELULAR: ${url[0]}\nMantenha este terminal aberto. O link é temporário.\n`,
      )
      writeFileSync(path.join(root, 'tools', 'mobile-url.txt'), url[0])
    }
  }
  child.stdout.on('data', output)
  child.stderr.on('data', output)
  child.on('error', (e) => console.error('Falha ao iniciar túnel:', e.message))
  return child
}

export async function tunnel(port) {
  if (process.env.KEYRADAR_TUNNEL === 'cloudflare') return cloudflareTunnel(port)
  mkdirSync(path.join(root, 'tools'), { recursive: true })
  const ssh =
    process.platform === 'win32'
      ? path.join(process.env.WINDIR || 'C:\\Windows', 'System32', 'OpenSSH', 'ssh.exe')
      : 'ssh'
  const args = [
    '-o',
    'StrictHostKeyChecking=accept-new',
    '-o',
    'UserKnownHostsFile=tools/known_hosts',
    '-o',
    'ServerAliveInterval=30',
    '-o',
    'ConnectTimeout=20',
    '-o',
    'ExitOnForwardFailure=yes',
    '-T',
    '-R',
    `80:127.0.0.1:${port}`,
    'nokey@localhost.run',
  ]

  let child,
    retryTimer,
    stopped = false,
    attempts = 0,
    currentUrl = ''
  function connect() {
    if (stopped) return
    console.log('Abrindo HTTPS temporário via localhost.run...')
    child = spawn(ssh, args, { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let buffer = ''
    const output = (chunk) => {
      buffer = (buffer + chunk.toString()).slice(-20000)
      const url = extractTunnelUrl(buffer)
      if (url && url !== currentUrl) {
        currentUrl = url
        attempts = 0
        console.log(
          `\nABRA ESTE ENDEREÇO NO CELULAR: ${url}\nO provedor pode trocar o domínio. Use sempre o último link exibido.\n`,
        )
        writeFileSync(path.join(root, 'tools', 'mobile-url.txt'), url)
      }
    }
    child.stdout.on('data', output)
    child.stderr.on('data', output)
    child.on('error', (error) => console.error('Falha no SSH:', error.message))
    child.on('close', (code) => {
      if (stopped) return
      currentUrl = ''
      writeFileSync(
        path.join(root, 'tools', 'mobile-url.txt'),
        'Túnel desconectado. Aguarde um novo endereço no terminal.',
      )
      console.error(`Túnel desconectado (${code}). Tentando reconectar...`)
      if (++attempts > 5) {
        console.error(
          'Não foi possível reconectar. Reinicie o comando ou tente KEYRADAR_TUNNEL=cloudflare.',
        )
        console.error(stripVTControlCharacters(buffer).slice(0, 2000))
        return
      }
      retryTimer = setTimeout(connect, Math.min(30000, attempts * 3000))
    })
  }
  connect()
  return {
    kill() {
      stopped = true
      clearTimeout(retryTimer)
      child?.kill()
    },
  }
}
