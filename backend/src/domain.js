export function validateReading(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Se requiere un objeto JSON')
  const fields = {
    gas: [0, 100],
    temperature: [-20, 80],
    humidity: [0, 100],
    light: [0, 100],
  }
  const reading = {}
  for (const [name, [min, max]] of Object.entries(fields)) {
    const value = input[name]
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
      throw new Error(`${name} debe ser un número entre ${min} y ${max}`)
    }
    reading[name] = value
  }
  const deviceId = input.deviceId ?? 'esp32-01'
  if (typeof deviceId !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(deviceId)) {
    throw new Error('deviceId debe contener entre 1 y 64 letras, números, guiones o guiones bajos')
  }
  return { ...reading, deviceId }
}

export function classify(reading, previousState, thresholds) {
  const { gasWarning, gasDanger, tempWarning } = thresholds
  if (reading.gas >= gasDanger || (previousState === 'danger' && reading.gas >= gasDanger - 5)) return 'danger'
  if (
    reading.gas >= gasWarning || reading.temperature >= tempWarning ||
    (previousState === 'warning' && (reading.gas >= gasWarning - 5 || reading.temperature >= tempWarning - 1))
  ) return 'warning'
  return 'normal'
}

export function createAlert(reading, previousState, thresholds) {
  if (reading.state === 'danger' && previousState !== 'danger') {
    return {
      kind: 'danger',
      title: 'Posible fuga de gas',
      detail: `${reading.gas}% relativo de gas · ${reading.temperature.toFixed(1)} °C · ${reading.light < thresholds.darkness ? 'A oscuras' : 'Iluminado'}`,
    }
  }
  if (reading.state === 'warning' && previousState === 'normal') {
    return {
      kind: 'warning',
      title: 'Lectura elevada',
      detail: `${reading.gas}% relativo de gas · ${reading.temperature.toFixed(1)} °C · ${reading.light < thresholds.darkness ? 'A oscuras' : 'Iluminado'}`,
    }
  }
  return null
}
