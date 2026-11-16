import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

function invalid(message, status = 400) {
  return Object.assign(new Error(message), { status })
}

function validate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw invalid('Datos del destinatario inválidos')
  const name = typeof input.name === 'string' ? input.name.trim() : ''
  const chatId = typeof input.chatId === 'string' ? input.chatId.trim() : ''
  if (!name || name.length > 80) throw invalid('El nombre debe tener entre 1 y 80 caracteres')
  if (!/^-?[1-9]\d{0,15}$/.test(chatId)) throw invalid('Introduce el ID numérico del chat de Telegram')
  if (typeof input.enabled !== 'boolean') throw invalid('enabled debe ser verdadero o falso')
  return { name, chatId, enabled: input.enabled }
}

export class RecipientStore {
  constructor(directory) {
    this.directory = directory
    this.file = join(directory, 'telegram-recipients.json')
    this.items = []
    this.queue = Promise.resolve()
  }

  async init(legacyChatId) {
    await mkdir(this.directory, { recursive: true })
    try {
      this.items = JSON.parse(await readFile(this.file, 'utf8'))
      if (!Array.isArray(this.items)) throw new Error('Archivo de destinatarios inválido')
      for (const item of this.items) validate(item)
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
      this.items = legacyChatId ? [{ id: randomUUID(), ...validate({ name: 'Destinatario inicial', chatId: legacyChatId, enabled: true }) }] : []
      await this.save(this.items)
    }
  }

  list() {
    return this.items.map((item) => ({ ...item }))
  }

  async save(items) {
    const temporary = `${this.file}.tmp`
    await writeFile(temporary, JSON.stringify(items, null, 2), { encoding: 'utf8', mode: 0o600 })
    await rename(temporary, this.file)
    this.items = items
  }

  mutate(action) {
    const task = this.queue.then(async () => {
      const items = this.list()
      const result = action(items)
      await this.save(items)
      return result
    })
    this.queue = task.catch(() => {})
    return task
  }

  add(input) {
    const data = validate(input)
    return this.mutate((items) => {
      if (items.some((item) => item.chatId === data.chatId)) throw invalid('Este chat ya está registrado', 409)
      if (items.length >= 20) throw invalid('Puedes registrar hasta 20 destinatarios')
      const item = { id: randomUUID(), ...data }
      items.push(item)
      return item
    })
  }

  update(id, input) {
    const data = validate(input)
    return this.mutate((items) => {
      const index = items.findIndex((item) => item.id === id)
      if (index < 0) throw invalid('Destinatario no encontrado', 404)
      if (items.some((item) => item.id !== id && item.chatId === data.chatId)) throw invalid('Este chat ya está registrado', 409)
      items[index] = { id, ...data }
      return items[index]
    })
  }

  remove(id) {
    return this.mutate((items) => {
      const index = items.findIndex((item) => item.id === id)
      if (index < 0) throw invalid('Destinatario no encontrado', 404)
      items.splice(index, 1)
    })
  }
}
