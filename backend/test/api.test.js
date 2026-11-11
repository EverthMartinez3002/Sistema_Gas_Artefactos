import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createApiServer } from '../src/server.js'

test('recibe, guarda y consulta lecturas con clave del ESP32', async () => {
  const directory = await mkdtemp(join(process.cwd(), '.test-vigia-'))
  const config = {
    dataDir: directory,
    deviceApiKey: 'test-key-123',
    telegramBotToken: '',
    telegramChatId: '',
    alertTimeZone: 'America/El_Salvador',
    thresholds: { gasWarning: 35, gasDanger: 60, tempWarning: 30, darkness: 30 },
  }
  let server
  try {
    server = await createApiServer(config)
    await new Promise((done) => server.listen(0, '127.0.0.1', done))
    const base = `http://127.0.0.1:${server.address().port}`
    const sample = { gas: 18, temperature: 25.4, humidity: 61, light: 72 }
    const send = (reading, key = config.deviceApiKey) => fetch(`${base}/api/readings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key },
      body: JSON.stringify(reading),
    })

    assert.equal((await send(sample, 'incorrecta')).status, 401)
    assert.equal((await send({ ...sample, gas: 130 })).status, 400)
    const first = await send(sample)
    assert.equal(first.status, 201)
    assert.equal((await first.json()).reading.state, 'normal')
    const warning = await (await send({ ...sample, gas: 42 })).json()
    assert.equal(warning.alert.kind, 'warning')
    const danger = await (await send({ ...sample, gas: 75, light: 12 })).json()
    assert.equal(danger.alert.kind, 'danger')
    assert.equal(danger.telegram, 'not_configured')
    const repeated = await (await send({ ...sample, gas: 76 })).json()
    assert.equal(repeated.alert, null)

    const dashboard = await (await fetch(`${base}/api/dashboard`)).json()
    assert.equal(dashboard.state, 'danger')
    assert.equal(dashboard.online, true)
    assert.equal(dashboard.readings.length, 4)
    assert.equal(dashboard.alerts.length, 2)
    assert.equal(dashboard.latest.gas, 76)

    await new Promise((done) => server.close(done))
    server = null
    const restarted = await createApiServer(config)
    assert.equal(restarted.listening, false)
    await new Promise((done) => restarted.listen(0, '127.0.0.1', done))
    const persisted = await (await fetch(`http://127.0.0.1:${restarted.address().port}/api/dashboard`)).json()
    assert.equal(persisted.readings.length, 4)
    assert.equal(persisted.alerts.length, 2)
    await new Promise((done) => restarted.close(done))
  } finally {
    if (server?.listening) await new Promise((done) => server.close(done))
    const absolute = resolve(directory)
    if (absolute.startsWith(`${resolve(process.cwd())}\\.test-vigia-`)) await rm(absolute, { recursive: true, force: true })
  }
})
