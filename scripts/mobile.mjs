import { preview } from 'vite'
import { tunnel } from './tunnel.mjs'
const server = await preview()
server.printUrls()
let child
try {
  child = await tunnel(4173)
} catch (e) {
  console.error(e)
  server.httpServer.close()
  process.exit(1)
}
function close() {
  child?.kill()
  server.httpServer.close()
  process.exit()
}
process.on('SIGINT', close)
process.on('SIGTERM', close)
