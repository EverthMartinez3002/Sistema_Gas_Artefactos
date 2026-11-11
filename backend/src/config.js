import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export function loadLocalEnv(file = resolve(process.cwd(), '.env')) {
  if (!existsSync(file)) return
  for (const rawLine of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const match = line.match(/^([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/)
    if (!match || process.env[match[1]] !== undefined) continue
    let value = match[2].trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    process.env[match[1]] = value
  }
}

function numberFromEnv(name, fallback) {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return fallback
  const value = Number(raw)
  if (!Number.isFinite(value)) throw new Error(`${name} debe ser un número`)
  return value
}

export function getConfig() {
  loadLocalEnv()
  const config = {
    host: process.env.HOST || '0.0.0.0',
    port: numberFromEnv('PORT', 3001),
    dataDir: resolve(process.cwd(), process.env.DATA_DIR || './data'),
    frontendOrigins: (process.env.FRONTEND_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173').split(',').map((origin) => origin.trim()).filter(Boolean),
    deviceApiKey: process.env.DEVICE_API_KEY || '',
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
    telegramChatId: process.env.TELEGRAM_CHAT_ID || '',
    alertTimeZone: process.env.ALERT_TIME_ZONE || 'America/El_Salvador',
    thresholds: {
      gasWarning: numberFromEnv('GAS_WARNING', 35),
      gasDanger: numberFromEnv('GAS_DANGER', 60),
      tempWarning: numberFromEnv('TEMP_WARNING', 30),
      darkness: numberFromEnv('DARKNESS_THRESHOLD', 30),
    },
  }
  if (!Number.isInteger(config.port) || config.port < 0 || config.port > 65535) throw new Error('PORT inválido')
  const { gasWarning, gasDanger, tempWarning, darkness } = config.thresholds
  if (!(gasWarning > 0 && gasWarning < gasDanger && gasDanger <= 100)) throw new Error('Umbrales de gas inválidos')
  if (!(tempWarning > -20 && tempWarning <= 80 && darkness >= 0 && darkness <= 100)) throw new Error('Umbrales de temperatura o luz inválidos')
  try {
    new Intl.DateTimeFormat('es-SV', { timeZone: config.alertTimeZone })
  } catch {
    throw new Error('ALERT_TIME_ZONE inválida')
  }
  return config
}
