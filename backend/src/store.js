import { randomUUID } from 'node:crypto'
import { appendFile, mkdir, readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { classify, createAlert } from './domain.js'

export class DataStore {
  constructor(directory, thresholds) {
    this.directory = directory
    this.thresholds = thresholds
    this.latest = null
    this.queue = Promise.resolve()
  }

  async init() {
    await mkdir(this.directory, { recursive: true })
    this.latest = (await this.recent('readings', 1))[0] ?? null
  }

  async recent(kind, limit) {
    const files = (await readdir(this.directory))
      .filter((name) => new RegExp(`^${kind}-\\d{4}-\\d{2}-\\d{2}\\.ndjson$`).test(name))
      .sort().reverse()
    const result = []
    for (const file of files) {
      const content = await readFile(join(this.directory, file), 'utf8')
      const lines = content.trim().split('\n').filter(Boolean)
      for (let index = lines.length - 1; index >= 0 && result.length < limit; index--) {
        result.push(JSON.parse(lines[index]))
      }
      if (result.length >= limit) break
    }
    return result
  }

  async append(kind, item) {
    const date = item.time.slice(0, 10)
    await appendFile(join(this.directory, `${kind}-${date}.ndjson`), `${JSON.stringify(item)}\n`, 'utf8')
  }

  ingest(input) {
    const task = async () => {
      const previousState = this.latest?.state ?? 'normal'
      const reading = {
        id: randomUUID(),
        time: new Date().toISOString(),
        ...input,
        state: classify(input, previousState, this.thresholds),
      }
      await this.append('readings', reading)
      this.latest = reading
      const alertDraft = createAlert(reading, previousState, this.thresholds)
      const alert = alertDraft ? {
        id: randomUUID(),
        time: reading.time,
        deviceId: reading.deviceId,
        readingId: reading.id,
        acknowledged: false,
        ...alertDraft,
      } : null
      if (alert) await this.append('alerts', alert)
      return { reading, alert }
    }
    const result = this.queue.then(task)
    this.queue = result.catch(() => {})
    return result
  }
}
