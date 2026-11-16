import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { join, dirname, resolve } from 'node:path'
import { RecipientStore } from '../src/recipients.js'
import { createApiServer } from '../src/server.js'

test('administra destinos con autenticación y envía solo a los activos', async (t) => {
  const directory = await mkdtemp(join(process.cwd(), '.test-recipients-'))
  const config = {
    dataDir: directory, adminApiKey: 'admin-key', deviceApiKey: 'device-key',
    telegramBotToken: 'fake-token', telegramChatId: '111', alertTimeZone: 'America/El_Salvador',
    thresholds: { gasWarning: 35, gasDanger: 60, tempWarning: 30, darkness: 30 },
  }
  const sentTo = []
  const realFetch = globalThis.fetch
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (!String(url).startsWith('https://api.telegram.org/')) return realFetch(url, options)
    const body = JSON.parse(options.body)
    if (String(url).endsWith('/sendMessage')) sentTo.push(body.chat_id)
    const result = String(url).endsWith('/getMe') ? { username: 'TestBot' }
      : String(url).endsWith('/getUpdates') ? [{ message: { chat: { id: 222, first_name: 'Responsable' } } }] : {}
    return new Response(JSON.stringify({ ok: true, result }), { status: 200 })
  })
  let server
  try {
    server = await createApiServer(config)
    await new Promise((done) => server.listen(0, '127.0.0.1', done))
    const base = `http://127.0.0.1:${server.address().port}`
    const request = (path, method = 'GET', body, key = 'admin-key') => fetch(`${base}/api/telegram/${path}`, {
      method, headers: { 'x-admin-key': key, 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
    assert.equal((await request('settings', 'GET', undefined, 'device-key')).status, 401)
    const initial = (await (await request('settings')).json()).recipients[0]
    assert.equal(initial.chatId, '111')
    const discovered = await (await request('chats', 'POST')).json()
    assert.deepEqual(discovered.chats, [{ chatId: '222', name: 'Responsable' }])
    assert.equal((await request('recipients', 'POST', { name: 'Mal', chatId: '+50370000000', enabled: true })).status, 400)
    const input = { name: 'Responsable', chatId: '222', enabled: true }
    const added = await request('recipients', 'POST', input)
    assert.equal(added.status, 201)
    const second = (await added.json()).recipient
    assert.equal((await request('recipients', 'POST', input)).status, 409)
    assert.equal((await request(`recipients/${initial.id}`, 'PATCH', { ...initial, enabled: false })).status, 200)
    const reading = await fetch(`${base}/api/readings`, {
      method: 'POST', headers: { 'x-api-key': 'device-key', 'content-type': 'application/json' },
      body: JSON.stringify({ gas: 75, temperature: 25, humidity: 60, light: 10 }),
    })
    assert.equal((await reading.json()).telegram, 'sent')
    assert.deepEqual(sentTo, ['222'])
    assert.equal((await request(`recipients/${second.id}/test`, 'POST')).status, 200)
    assert.deepEqual(sentTo, ['222', '222'])
    await request(`recipients/${initial.id}`, 'DELETE')
    await request(`recipients/${second.id}`, 'DELETE')
    const reloaded = new RecipientStore(directory)
    await reloaded.init('111')
    assert.deepEqual(reloaded.list(), [])
  } finally {
    if (server?.listening) await new Promise((done) => server.close(done))
    const absolute = resolve(directory)
    if (dirname(absolute) === resolve(process.cwd())) await rm(absolute, { recursive: true, force: true })
  }
})
