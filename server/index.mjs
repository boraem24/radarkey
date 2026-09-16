import http from 'node:http'
import { musicMiddleware } from './api.mjs'

const env = process.env
const middleware = musicMiddleware(env)
const server = http.createServer((req, res) => {
  middleware(req, res, () => {
    res.statusCode = 404
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ error: 'Recurso não encontrado.' }))
  }).catch((error) => {
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Erro interno.' }))
  })
})
const port = Number(process.env.PORT || 10000)
server.listen(port, '0.0.0.0', () => console.log(`KeyRadar API ouvindo na porta ${port}`))
