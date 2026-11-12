export async function telegramRequest(config, method, payload = {}) {
  if (!config.telegramBotToken) throw new Error('Configura TELEGRAM_BOT_TOKEN en backend/.env')
  let response
  let result
  try {
    response = await fetch(`https://api.telegram.org/bot${config.telegramBotToken}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8_000),
    })
    result = await response.json()
  } catch {
    throw new Error('No se pudo contactar con Telegram. Comprueba la conexión e inténtalo de nuevo.')
  }
  if (!response.ok || !result.ok) {
    const code = result.error_code || response.status
    const hints = {
      400: 'Comprueba el ID del chat y que hayas iniciado la conversación con el bot.',
      401: 'El token del bot es inválido.',
      403: 'El bot no tiene permiso para escribir en este chat o fue bloqueado.',
      409: 'Otro proceso o webhook está recibiendo los mensajes del bot.',
      429: 'Se alcanzó el límite de solicitudes. Espera antes de reintentar.',
    }
    throw new Error(`Telegram (${code}): ${hints[code] || 'No se pudo completar la solicitud.'}`)
  }
  return result.result
}

export async function sendTelegramAlert(alert, reading, config) {
  if (!alert) return 'not_needed'
  if (!config.telegramBotToken || !config.telegramChatId) return 'not_configured'
  const time = new Intl.DateTimeFormat('es-SV', {
    timeZone: config.alertTimeZone,
    dateStyle: 'short',
    timeStyle: 'short',
    hourCycle: 'h23',
  }).format(new Date(alert.time))
  const message = [
    alert.kind === 'danger' ? '🚨 Posible fuga de gas' : '⚠️ Advertencia del ambiente',
    `Gas: ${reading.gas}% relativo`,
    `Temperatura: ${reading.temperature.toFixed(1)} °C | Humedad: ${reading.humidity}%`,
    `Iluminación: ${reading.light < config.thresholds.darkness ? 'a oscuras' : 'iluminado'}`,
    `Estado: ${alert.kind === 'danger' ? 'Peligro' : 'Advertencia'}`,
    `Hora: ${time}`,
  ].join('\n')
  try {
    await telegramRequest(config, 'sendMessage', { chat_id: config.telegramChatId, text: message })
    return 'sent'
  } catch (error) {
    console.error(`No se pudo enviar la alerta a Telegram: ${error.message}`)
    return 'failed'
  }
}
