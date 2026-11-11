import test from 'node:test'
import assert from 'node:assert/strict'
import { classify, createAlert, validateReading } from '../src/domain.js'

const thresholds = { gasWarning: 35, gasDanger: 60, tempWarning: 30, darkness: 30 }
const sample = { gas: 18, temperature: 25, humidity: 60, light: 70 }

test('valida números y no acepta valores fuera de escala', () => {
  assert.deepEqual(validateReading(sample), { ...sample, deviceId: 'esp32-01' })
  assert.throws(() => validateReading({ ...sample, gas: '75' }), /gas/)
  assert.throws(() => validateReading({ ...sample, light: 101 }), /light/)
})

test('clasifica estados y aplica histéresis al volver de peligro', () => {
  assert.equal(classify(sample, 'normal', thresholds), 'normal')
  assert.equal(classify({ ...sample, temperature: 31 }, 'normal', thresholds), 'warning')
  assert.equal(classify({ ...sample, gas: 62 }, 'normal', thresholds), 'danger')
  assert.equal(classify({ ...sample, gas: 57 }, 'danger', thresholds), 'danger')
  assert.equal(classify({ ...sample, gas: 54 }, 'danger', thresholds), 'warning')
})

test('genera alertas solo al entrar en advertencia o peligro', () => {
  const warning = { ...sample, gas: 42, state: 'warning' }
  const danger = { ...sample, gas: 75, light: 10, state: 'danger' }
  assert.equal(createAlert(warning, 'normal', thresholds).kind, 'warning')
  assert.equal(createAlert(warning, 'warning', thresholds), null)
  assert.equal(createAlert(danger, 'warning', thresholds).kind, 'danger')
  assert.match(createAlert(danger, 'warning', thresholds).detail, /A oscuras/)
  assert.equal(createAlert(danger, 'danger', thresholds), null)
})
