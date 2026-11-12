import test from 'node:test'
import assert from 'node:assert/strict'
import { sendTelegramAlert, telegramRequest } from '../src/telegram.js'

const config = {
  telegramBotToken: 'token-de-prueba',
  telegramChatId: '123456',
  alertTimeZone: 'America/El_Salvador',
  thresholds: { darkness: 30 },
}

test('el aviso contiene lecturas y hora del lugar sin inferir ocupación', async (t) => {
  let message
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    message = JSON.parse(options.body)
    return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 })
  })
  const result = await sendTelegramAlert(
    { kind: 'danger', time: '2026-11-12T20:32:00.000Z' },
    { gas: 76, temperature: 31.2, humidity: 70, light: 12 },
    config,
  )
  assert.equal(result, 'sent')
  assert.equal(message.chat_id, '123456')
  assert.match(message.text, /76% relativo/)
  assert.match(message.text, /a oscuras/)
  assert.match(message.text, /14:32/)
  assert.doesNotMatch(message.text, /vacío|sin personas/)
})

test('los errores de conexión no exponen el token del bot', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('https://api.telegram.org/bottoken-de-prueba/getMe') })
  await assert.rejects(telegramRequest(config, 'getMe'), (error) => {
    assert.doesNotMatch(error.message, /token-de-prueba/)
    return true
  })
})

test('un token rechazado devuelve un diagnóstico claro', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ ok: false, error_code: 401 }), { status: 401 }))
  await assert.rejects(telegramRequest(config, 'getMe'), /token del bot es inválido/)
})
