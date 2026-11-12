import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { getConfig } from '../src/config.js'
import { telegramRequest } from '../src/telegram.js'

async function main() {
  const config = getConfig()
  const command = process.argv[2]
  const bot = await telegramRequest(config, 'getMe')
  console.log(`Bot verificado: @${bot.username}`)

  if (command === 'setup') {
    const explicitChat = process.argv[3]
    let chatId = explicitChat || config.telegramChatId
    if (!chatId) {
      const updates = await telegramRequest(config, 'getUpdates', { limit: 100, timeout: 0, allowed_updates: ['message'] })
      const chats = new Map()
      for (const update of updates) {
        const chat = update.message?.chat
        if (chat) chats.set(String(chat.id), chat)
      }
      if (chats.size === 0) throw new Error('Abre el bot en Telegram, pulsa Iniciar y envía /start. Después repite este comando.')
      if (chats.size > 1) {
        for (const [id, chat] of chats) console.log(`Chat ${id}: ${chat.title || chat.first_name || chat.username || chat.type}`)
        throw new Error('Hay varios chats. Elige el destinatario con: npm run telegram:setup -- ID_DEL_CHAT')
      }
      chatId = [...chats.keys()][0]
    }
    if (!/^-?\d+$/.test(chatId)) throw new Error('El ID del chat debe ser un número válido.')
    const chat = await telegramRequest(config, 'getChat', { chat_id: chatId })
    const envFile = resolve(process.cwd(), '.env')
    const content = await readFile(envFile, 'utf8')
    const next = /^TELEGRAM_CHAT_ID=.*$/m.test(content)
      ? content.replace(/^TELEGRAM_CHAT_ID=.*$/m, `TELEGRAM_CHAT_ID=${chatId}`)
      : `${content.trimEnd()}\nTELEGRAM_CHAT_ID=${chatId}\n`
    await writeFile(envFile, next, 'utf8')
    console.log(`Chat conectado: ${chat.title || chat.first_name || chat.username || chat.id}. ID guardado en backend/.env.`)
    console.log('Reinicia el backend para aplicar la configuración. Ejecuta npm run telegram:test para probar el aviso.')
    return
  }

  if (command === 'test') {
    if (!config.telegramChatId) throw new Error('Primero ejecuta npm run telegram:setup')
    await telegramRequest(config, 'sendMessage', {
      chat_id: config.telegramChatId,
      text: '✅ PRUEBA DE VIGÍA GAS\nLa conexión con Telegram funciona.\nEste es un mensaje de prueba; no corresponde a una fuga real.',
    })
    console.log('Mensaje de prueba enviado al chat configurado.')
    return
  }
  throw new Error('Usa telegram:setup o telegram:test desde la raíz del proyecto.')
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
