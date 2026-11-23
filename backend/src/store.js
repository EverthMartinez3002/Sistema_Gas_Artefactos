import { randomUUID } from 'node:crypto'
import { appendFile, mkdir, readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { classify, createAlert } from './domain.js'

export class DataStore {
  constructor(directory, thresholds) {
    this.directory = directory
    this.thresholds = thresholds
    this.latest = null
    this.stateByDevice = new Map()
    this.activeByDevice = new Map()
    this.alertClosures = new Map()
    this.queue = Promise.resolve()
  }

  async init() {
    await mkdir(this.directory, { recursive: true })
    const files = new Set(await readdir(this.directory))
    const readingFiles = [...files].filter((file) => /^readings-\d{4}-\d{2}-\d{2}\.ndjson$/.test(file)).sort()

    // Las lecturas guardadas también establecen cuándo terminó cada alerta.
    // Reconstruimos esos cierres al arrancar, incluidos los de registros anteriores.
    for (const file of readingFiles) {
      const alertFile = file.replace(/^readings-/, 'alerts-')
      const alerts = files.has(alertFile) ? (await this.lines(alertFile)).map(JSON.parse) : []
      const alertsByReading = new Map(alerts.map((alert) => [alert.readingId, alert]))
      for (const line of await this.lines(file)) {
        const reading = JSON.parse(line)
        this.trackReading(reading)
        const alert = alertsByReading.get(reading.id)
        if (alert && alert.deviceId === reading.deviceId && alert.kind === reading.state) this.trackAlert(alert)
      }
    }
  }

  async lines(file) {
    const content = await readFile(join(this.directory, file), 'utf8')
    return content.trim().split('\n').filter(Boolean)
  }

  trackReading(reading) {
    const active = this.activeByDevice.get(reading.deviceId)
    if (active && active.kind !== reading.state) {
      for (const id of active.ids) this.alertClosures.set(id, reading.time)
      this.activeByDevice.delete(reading.deviceId)
    }
    this.latest = reading
    this.stateByDevice.set(reading.deviceId, reading.state)
  }

  trackAlert(alert) {
    const active = this.activeByDevice.get(alert.deviceId)
    if (active) active.ids.push(alert.id)
    else this.activeByDevice.set(alert.deviceId, { kind: alert.kind, ids: [alert.id] })
    this.alertClosures.set(alert.id, null)
  }

  withLifecycle(alert) {
    const closure = this.alertClosures.get(alert.id)
    // Un registro sin su lectura de origen se conserva sin inventar un cierre.
    return {
      ...alert,
      status: closure === undefined ? 'unknown' : closure === null ? 'active' : 'closed',
      closedAt: closure ?? null,
      durationMs: closure ? Math.max(0, Date.parse(closure) - Date.parse(alert.time)) : null,
    }
  }

  async recent(kind, limit) {
    const files = (await readdir(this.directory))
      .filter((name) => new RegExp(`^${kind}-\\d{4}-\\d{2}-\\d{2}\\.ndjson$`).test(name))
      .sort().reverse()
    const result = []
    for (const file of files) {
      const lines = await this.lines(file)
      for (let index = lines.length - 1; index >= 0 && result.length < limit; index--) {
        result.push(JSON.parse(lines[index]))
      }
      if (result.length >= limit) break
    }
    return kind === 'alerts' ? result.map((alert) => this.withLifecycle(alert)) : result
  }

  async append(kind, item) {
    const date = item.time.slice(0, 10)
    await appendFile(join(this.directory, `${kind}-${date}.ndjson`), `${JSON.stringify(item)}\n`, 'utf8')
  }

  ingest(input) {
    const task = async () => {
      const previousState = this.stateByDevice.get(input.deviceId) ?? 'normal'
      const reading = {
        id: randomUUID(),
        time: new Date().toISOString(),
        ...input,
        state: classify(input, previousState, this.thresholds),
      }
      await this.append('readings', reading)
      this.trackReading(reading)
      const alertDraft = createAlert(reading, previousState, this.thresholds)
      const alert = alertDraft ? {
        id: randomUUID(),
        time: reading.time,
        deviceId: reading.deviceId,
        readingId: reading.id,
        acknowledged: false,
        ...alertDraft,
      } : null
      if (!alert) return { reading, alert: null }

      await this.append('alerts', alert)
      this.trackAlert(alert)
      return { reading, alert: this.withLifecycle(alert) }
    }
    const result = this.queue.then(task)
    this.queue = result.catch(() => {})
    return result
  }
}
