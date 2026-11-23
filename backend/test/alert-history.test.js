import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { DataStore } from '../src/store.js'

test('reconstruye el cierre de alertas antiguas entre días y conserva registros incompletos', async () => {
  const directory = await mkdtemp(join(process.cwd(), '.test-alert-history-'))
  const store = new DataStore(directory, { gasWarning: 35, gasDanger: 60, tempWarning: 30, darkness: 30 })
  try {
    const deviceId = 'esp32-01'
    const start = { id: 'reading-1', time: '2026-11-23T23:59:50.000Z', deviceId, state: 'danger' }
    const secondDevice = { id: 'reading-2', time: '2026-11-23T23:59:58.000Z', deviceId: 'esp32-02', state: 'normal' }
    const end = { id: 'reading-3', time: '2026-11-24T00:00:15.000Z', deviceId, state: 'warning' }
    const originalAlert = { id: 'alert-1', time: start.time, deviceId, readingId: start.id, kind: 'danger' }
    const incompleteAlert = { ...originalAlert, id: 'alert-2', readingId: 'missing' }

    for (const [filename, rows] of [
      ['readings-2026-11-23.ndjson', [start, secondDevice]],
      ['readings-2026-11-24.ndjson', [end]],
      ['alerts-2026-11-23.ndjson', [originalAlert, incompleteAlert]],
    ]) {
      await writeFile(join(directory, filename), `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`)
    }

    await store.init()
    const [incomplete, closed] = await store.recent('alerts', 2)
    assert.equal(incomplete.status, 'unknown')
    assert.equal(incomplete.durationMs, null)
    assert.deepEqual(closed, { ...originalAlert, status: 'closed', closedAt: end.time, durationMs: 25_000 })
  } finally {
    const absolute = resolve(directory)
    if (dirname(absolute) === resolve(process.cwd())) await rm(absolute, { recursive: true, force: true })
  }
})
