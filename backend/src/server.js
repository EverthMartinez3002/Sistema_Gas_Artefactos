import { createServer } from 'node:http'
import { timingSafeEqual } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { getConfig } from './config.js'
import { validateReading } from './domain.js'
import { DataStore } from './store.js'
import { sendTelegramAlert, telegramRequest } from './telegram.js'
import { RecipientStore } from './recipients.js'

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
  const recipients = new RecipientStore(config.dataDir)
  await recipients.init(config.telegramChatId)
  const allowedOrigins = new Set(config.frontendOrigins || ['http://localhost:5173', 'http://127.0.0.1:5173'])

  const server = createServer(async (request, response) => {
    const origin = request.headers.origin
    if (origin && allowedOrigins.has(origin)) {
      response.setHeader('access-control-allow-origin', origin)
      response.setHeader('vary', 'Origin')
      response.setHeader('access-control-allow-methods', 'GET, POST, PATCH, DELETE, OPTIONS')
      response.setHeader('access-control-allow-headers', 'content-type, x-api-key, x-admin-key')
    }
    if (request.method === 'OPTIONS') {
      response.writeHead(origin && !allowedOrigins.has(origin) ? 403 : 204)
      response.end()
      return
    }

    try {
      const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`)
      if (request.method === 'GET' && url.pathname === '/api/health') {
        sendJson(response, 200, { ok: true, deviceWriteEnabled: Boolean(config.deviceApiKey), telegramConfigured: Boolean(config.telegramBotToken && recipients.list().some((item) => item.enabled)) })
        return
      }
      if (url.pathname.startsWith('/api/telegram/')) {
        if (!config.adminApiKey) throw new HttpError(503, 'Configura ADMIN_API_KEY en backend/.env para administrar destinatarios')
        if (!isAuthorized(request.headers['x-admin-key'], config.adminApiKey)) throw new HttpError(401, 'Clave de administración inválida')
        const callTelegram = async (method, payload) => {
          if (!config.telegramBotToken) throw new HttpError(503, 'El token del bot aún no está configurado')
          try { return await telegramRequest(config, method, payload) }
          catch (error) { throw new HttpError(502, error.message) }
        }
        if (request.method === 'GET' && url.pathname === '/api/telegram/settings') {
          sendJson(response, 200, { configured: Boolean(config.telegramBotToken), recipients: recipients.list() })
          return
        }
        if (request.method === 'POST' && url.pathname === '/api/telegram/chats') {
          const bot = await callTelegram('getMe')
          const updates = await callTelegram('getUpdates', { limit: 100, timeout: 0, allowed_updates: ['message'] })
          const chats = new Map()
          for (const update of updates) {
            const chat = update.message?.chat
            if (chat) chats.set(String(chat.id), { chatId: String(chat.id), name: chat.title || [chat.first_name, chat.last_name].filter(Boolean).join(' ') || chat.username || 'Chat de Telegram' })
          }
          sendJson(response, 200, { botUsername: bot.username, chats: [...chats.values()] })
          return
        }
        if (request.method === 'POST' && url.pathname === '/api/telegram/recipients') {
          sendJson(response, 201, { recipient: await recipients.add(await readBody(request)) })
          return
        }
        const match = url.pathname.match(/^\/api\/telegram\/recipients\/([\w-]+)(\/test)?$/)
        if (match) {
          const recipient = recipients.list().find((item) => item.id === match[1])
          if (!recipient) throw new HttpError(404, 'Destinatario no encontrado')
          if (request.method === 'POST' && match[2]) {
            await callTelegram('sendMessage', { chat_id: recipient.chatId, text: '✅ PRUEBA DE VIGÍA GAS\nEste chat está configurado para recibir avisos.\nEste es un mensaje de prueba; no corresponde a una fuga real.' })
            sendJson(response, 200, { sent: true })
            return
          }
          if (request.method === 'PATCH' && !match[2]) {
            sendJson(response, 200, { recipient: await recipients.update(recipient.id, await readBody(request)) })
            return
          }
          if (request.method === 'DELETE' && !match[2]) {
            await recipients.remove(recipient.id)
            sendJson(response, 200, { deleted: true })
            return
          }
        }
        throw new HttpError(404, 'Ruta no encontrada')
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
        const telegram = await sendTelegramAlert(alert, reading, config, recipients.list())
        sendJson(response, 201, { reading, alert, telegram })
        return
      }
      throw new HttpError(404, 'Ruta no encontrada')
    } catch (error) {
      if (!error.status || error.status >= 500) console.error(error)
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
    if (!config.telegramBotToken) console.warn('Telegram no configurado: las alertas se guardarán sin enviar mensajes.')
  })
}
