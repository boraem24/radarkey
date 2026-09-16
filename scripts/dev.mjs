import { createServer } from 'vite'
import { tunnel } from './tunnel.mjs'
const server = await createServer()
await server.listen()
server.printUrls()
let child
try {
  child = await tunnel(5173)
} catch (e) {
  console.error(
    'HTTPS indisponível:',
    e.message,
    '\nO servidor local continua disponível. Tente novamente quando houver internet.',
  )
}
async function close() {
  child?.kill()
  await server.close()
  process.exit()
}
process.on('SIGINT', close)
process.on('SIGTERM', close)
