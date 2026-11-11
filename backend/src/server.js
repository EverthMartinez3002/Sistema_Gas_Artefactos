import { createServer } from 'node:http'
import { timingSafeEqual } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { getConfig } from './config.js'
import { validateReading } from './domain.js'
import { DataStore } from './store.js'
import { sendTelegramAlert } from './telegram.js'

class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function sendJson(response, status, value) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  response.end(JSON.stringify(value))
}

function isAuthorized(given, expected) {
  if (!given || !expected) return false
  const actualBuffer = Buffer.from(given)
  const expectedBuffer = Buffer.from(expected)
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
}

async function readBody(request) {
  if (!request.headers['content-type']?.startsWith('application/json')) {
    throw new HttpError(415, 'Se requiere Content-Type: application/json')
  }
  let body = ''
  for await (const chunk of request) {
    body += chunk
    if (Buffer.byteLength(body) > 4_096) throw new HttpError(413, 'La lectura excede 4 KB')
  }
  try {
    return JSON.parse(body)
  } catch {
    throw new HttpError(400, 'JSON inválido')
  }
}

function limitFromUrl(url, fallback, max) {
  const raw = url.searchParams.get('limit')
  if (raw === null) return fallback
  const limit = Number(raw)
  if (!Number.isInteger(limit) || limit < 1 || limit > max) throw new HttpError(400, `limit debe estar entre 1 y ${max}`)
  return limit
}

export async function createApiServer(config = getConfig()) {
  const store = new DataStore(config.dataDir, config.thresholds)
  await store.init()
  const allowedOrigins = new Set(config.frontendOrigins || ['http://localhost:5173', 'http://127.0.0.1:5173'])

  const server = createServer(async (request, response) => {
    const origin = request.headers.origin
    if (origin && allowedOrigins.has(origin)) {
      response.setHeader('access-control-allow-origin', origin)
      response.setHeader('vary', 'Origin')
      response.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS')
      response.setHeader('access-control-allow-headers', 'content-type, x-api-key')
    }
    if (request.method === 'OPTIONS') {
      response.writeHead(origin && !allowedOrigins.has(origin) ? 403 : 204)
      response.end()
      return
    }

    try {
      const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`)
      if (request.method === 'GET' && url.pathname === '/api/health') {
        sendJson(response, 200, { ok: true, deviceWriteEnabled: Boolean(config.deviceApiKey), telegramConfigured: Boolean(config.telegramBotToken && config.telegramChatId) })
        return
      }
      if (request.method === 'GET' && url.pathname === '/api/dashboard') {
        const limit = limitFromUrl(url, 30, 200)
        const [readings, alerts] = await Promise.all([store.recent('readings', limit), store.recent('alerts', 50)])
        const latest = store.latest
        sendJson(response, 200, {
          latest,
          readings: readings.reverse(),
          alerts,
          state: latest?.state ?? 'unknown',
          online: Boolean(latest && Date.now() - Date.parse(latest.time) <= 30_000),
          thresholds: config.thresholds,
        })
        return
      }
      if (request.method === 'GET' && url.pathname === '/api/readings') {
        const limit = limitFromUrl(url, 100, 500)
        sendJson(response, 200, { readings: (await store.recent('readings', limit)).reverse() })
        return
      }
      if (request.method === 'GET' && url.pathname === '/api/alerts') {
        const limit = limitFromUrl(url, 50, 200)
        sendJson(response, 200, { alerts: await store.recent('alerts', limit) })
        return
      }
      if (request.method === 'POST' && url.pathname === '/api/readings') {
        if (!config.deviceApiKey) throw new HttpError(503, 'Configura DEVICE_API_KEY para recibir lecturas')
        if (!isAuthorized(request.headers['x-api-key'], config.deviceApiKey)) throw new HttpError(401, 'Clave del dispositivo inválida')
        let input
        try {
          input = validateReading(await readBody(request))
        } catch (error) {
          if (error instanceof HttpError) throw error
          throw new HttpError(400, error.message)
        }
        const { reading, alert } = await store.ingest(input)
        const telegram = await sendTelegramAlert(alert, reading, config)
        sendJson(response, 201, { reading, alert, telegram })
        return
      }
      throw new HttpError(404, 'Ruta no encontrada')
    } catch (error) {
      if (!(error instanceof HttpError)) console.error(error)
      if (!response.headersSent) sendJson(response, error.status || 500, { error: error.status ? error.message : 'Error interno del servidor' })
    }
  })
  return server
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = getConfig()
  const server = await createApiServer(config)
  server.listen(config.port, config.host, () => {
    console.log(`Vigía Gas API escuchando en http://${config.host}:${config.port}`)
    if (!config.deviceApiKey) console.warn('DEVICE_API_KEY no configurada: la recepción de lecturas está desactivada.')
    if (!config.telegramBotToken || !config.telegramChatId) console.warn('Telegram no configurado: las alertas se guardarán sin enviar mensajes.')
  })
}
