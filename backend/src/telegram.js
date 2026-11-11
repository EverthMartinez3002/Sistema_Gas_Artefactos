export async function sendTelegramAlert(alert, reading, config) {
  if (!alert) return 'not_needed'
  if (!config.telegramBotToken || !config.telegramChatId) return 'not_configured'
  const time = new Intl.DateTimeFormat('es-SV', {
    timeZone: config.alertTimeZone,
    dateStyle: 'short',
    timeStyle: 'short',
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
    const response = await fetch(`https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: config.telegramChatId, text: message }),
      signal: AbortSignal.timeout(8_000),
    })
    const result = await response.json()
    if (!response.ok || !result.ok) throw new Error(`Telegram respondió HTTP ${response.status}`)
    return 'sent'
  } catch (error) {
    console.error(`No se pudo enviar la alerta a Telegram: ${error.message}`)
    return 'failed'
  }
}
