import { useEffect, useRef, useState } from 'react'
import { getDashboard, type DashboardData } from './api'
import {
  Activity,
  Bell,
  Check,
  ChevronRight,
  Clock3,
  Download,
  Droplets,
  LayoutDashboard,
  Lightbulb,
  Menu,
  Pause,
  Play,
  Radio,
  ShieldCheck,
  Thermometer,
  TriangleAlert,
  Wifi,
  X,
} from 'lucide-react'

type Scenario = 'normal' | 'warning' | 'danger'
type Reading = {
  id: number | string
  time: Date
  gas: number
  temperature: number
  humidity: number
  light: number
}
type Alert = {
  id: number | string
  time: Date
  kind: 'warning' | 'danger'
  title: string
  detail: string
  acknowledged: boolean
}

const scenarioCopy: Record<Scenario, { label: string; message: string; hint: string }> = {
  normal: {
    label: 'Ambiente seguro',
    message: 'Todo está bajo control',
    hint: 'Las lecturas se encuentran dentro de los rangos esperados.',
  },
  warning: {
    label: 'Requiere atención',
    message: 'Hay una lectura elevada',
    hint: 'Revisa las condiciones del espacio y verifica el sensor.',
  },
  danger: {
    label: 'Posible fuga',
    message: 'Alerta de gas detectada',
    hint: 'El prototipo activaría el buzzer y el relé en este estado.',
  },
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const jitter = (amount: number) => (Math.random() - 0.5) * amount

function makeReading(scenario: Scenario, id: number, time = new Date()): Reading {
  const base = {
    normal: { gas: 18, temperature: 25.6, humidity: 61, light: 72 },
    warning: { gas: 44, temperature: 30.7, humidity: 66, light: 65 },
    danger: { gas: 76, temperature: 31.4, humidity: 69, light: 13 },
  }[scenario]

  return {
    id,
    time,
    gas: Math.round(clamp(base.gas + jitter(6), 0, 100)),
    temperature: Math.round((base.temperature + jitter(0.8)) * 10) / 10,
    humidity: Math.round(clamp(base.humidity + jitter(5), 0, 100)),
    light: Math.round(clamp(base.light + jitter(8), 0, 100)),
  }
}

function seedReadings(): Reading[] {
  const now = Date.now()
  return Array.from({ length: 30 }, (_, index) => {
    const wave = Math.sin(index / 3.7) * 4
    const reading = makeReading('normal', index + 1, new Date(now - (29 - index) * 5_000))
    return { ...reading, gas: Math.round(clamp(reading.gas + wave, 8, 32)) }
  })
}

const timeText = (date: Date) =>
  new Intl.DateTimeFormat('es-SV', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date)

const dateText = (date: Date) =>
  new Intl.DateTimeFormat('es-SV', { day: 'numeric', month: 'long', year: 'numeric' }).format(date)

function GasChart({ readings, live }: { readings: Reading[]; live: boolean }) {
  const chart = readings.slice(-30)
  const width = 720
  const height = 222
  const top = 18
  const bottom = 20
  const innerHeight = height - top - bottom
  const points = chart.map((reading, index) => {
    const x = chart.length === 1 ? width / 2 : (index / Math.max(chart.length - 1, 1)) * width
    const y = top + (1 - reading.gas / 100) * innerHeight
    return [x, y] as const
  })
  const line = points.map(([x, y]) => `${x},${y}`).join(' ')
  const area = `M 0 ${height} L ${points.map(([x, y]) => `${x} ${y}`).join(' L ')} L ${width} ${height} Z`
  const last = points.at(-1) ?? [width, height / 2]

  return (
    <div className="chart-wrap" aria-label="Tendencia reciente del nivel relativo de gas">
      <div className="chart-y-labels" aria-hidden="true"><span>100</span><span>75</span><span>50</span><span>25</span><span>0</span></div>
      <svg className="chart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="Gráfico de las últimas 30 lecturas de gas">
        <defs>
          <linearGradient id="gas-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2aa78f" stopOpacity="0.26" />
            <stop offset="100%" stopColor="#2aa78f" stopOpacity="0.015" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
          <line key={fraction} x1="0" x2={width} y1={top + innerHeight * fraction} y2={top + innerHeight * fraction} stroke="#e9edf1" strokeDasharray="5 6" />
        ))}
        <path d={area} fill="url(#gas-area)" />
        <polyline points={line} fill="none" stroke="#269c84" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <circle cx={last[0]} cy={last[1]} r="7" fill="#269c84" stroke="white" strokeWidth="4" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="chart-x-labels"><span>{live ? timeText(chart[0].time) : 'Hace 2 min'}</span><span>{live ? 'Historial reciente' : 'Hace 1 min'}</span><span>{live ? timeText(chart[chart.length - 1].time) : 'Ahora'}</span></div>
    </div>
  )
}

function App() {
  const [readings, setReadings] = useState<Reading[]>(seedReadings)
  const [scenario, setScenario] = useState<Scenario>('normal')
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [paused, setPaused] = useState(false)
  const [clock, setClock] = useState(() => Date.now())
  const [menuOpen, setMenuOpen] = useState(false)
  const [backendData, setBackendData] = useState<DashboardData | null>(null)
  const [apiReachable, setApiReachable] = useState(false)
  const [viewMode, setViewMode] = useState<'demo' | 'live'>('demo')
  const manualDemo = useRef(false)

  const isLive = viewMode === 'live' && Boolean(backendData?.latest)
  const readingsToShow: Reading[] = isLive
    ? backendData!.readings.map((item) => ({ ...item, time: new Date(item.time) }))
    : readings
  const alertsToShow: Alert[] = isLive
    ? backendData!.alerts.map((item) => ({ ...item, time: new Date(item.time) }))
    : alerts
  const current = readingsToShow[readingsToShow.length - 1]
  const activeScenario = isLive ? backendData!.latest!.state : scenario
  const sourceOnline = isLive && apiReachable && clock - current.time.getTime() <= 30_000
  const statusCopy = isLive && !sourceOnline
    ? { label: 'Sin lecturas recientes', message: 'Dispositivo sin conexión', hint: 'Mostramos la última lectura recibida. Verifica el ESP32 y la red Wi-Fi.' }
    : scenarioCopy[activeScenario]
  const darkness = current.light < 30
  const secondsAgo = Math.max(0, Math.floor((clock - current.time.getTime()) / 1000))

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (paused || isLive) return
    const timer = window.setInterval(() => {
      setReadings((previous) => [
        ...previous.slice(-59),
        makeReading(scenario, Number(previous[previous.length - 1].id) + 1),
      ])
    }, 5_000)
    return () => window.clearInterval(timer)
  }, [paused, scenario, isLive])

  useEffect(() => {
    let stopped = false
    let timer: number
    async function poll() {
      try {
        const data = await getDashboard()
        if (stopped) return
        setBackendData(data)
        setApiReachable(true)
        if (data.latest && !manualDemo.current) setViewMode('live')
      } catch {
        if (!stopped) setApiReachable(false)
      } finally {
        if (!stopped) timer = window.setTimeout(poll, 5_000)
      }
    }
    void poll()
    return () => { stopped = true; window.clearTimeout(timer) }
  }, [])

  function changeScenario(next: Scenario) {
    if (next === scenario) return
    const time = new Date()
    const reading = makeReading(next, Number(readings[readings.length - 1].id) + 1, time)
    setScenario(next)
    setReadings((previous) => [...previous.slice(-59), reading])
    setClock(time.getTime())

    if (next !== 'normal') {
      setAlerts((previous) => [{
        id: time.getTime(),
        time,
        kind: next,
        title: next === 'danger' ? 'Posible fuga de gas' : 'Lectura elevada',
        detail: `${reading.gas}% relativo de gas · ${reading.temperature.toFixed(1)} °C · ${reading.light < 30 ? 'A oscuras' : 'Iluminado'}`,
        acknowledged: false,
      }, ...previous])
    }
  }

  function exportCsv() {
    const rows = [
      ['fecha_hora', 'gas_relativo_porcentaje', 'temperatura_c', 'humedad_porcentaje', 'iluminacion_relativa_porcentaje'],
      ...readingsToShow.map((reading) => [
        reading.time.toISOString(), reading.gas, reading.temperature, reading.humidity, reading.light,
      ]),
    ]
    const csv = rows.map((row) => row.join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `vigia-gas-${isLive ? 'esp32' : 'demo'}-${new Date().toISOString().slice(0, 10)}.csv`
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
  }

  return (
    <div className="app-shell">
      {menuOpen && <button className="mobile-backdrop" aria-label="Cerrar menú" onClick={() => setMenuOpen(false)} />}
      <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
        <div className="brand">
          <div className="brand-mark"><Activity size={25} strokeWidth={2.7} /></div>
          <div><strong>vigía<span>.</span></strong><small>MONITOREO DE GAS</small></div>
          <button className="menu-close icon-button" aria-label="Cerrar menú" onClick={() => setMenuOpen(false)}><X size={19} /></button>
        </div>

        <div className="sidebar-section-label">ESPACIO DE TRABAJO</div>
        <nav className="side-nav" aria-label="Navegación principal">
          <a href="#resumen" className="active" onClick={() => setMenuOpen(false)}><LayoutDashboard size={19} /> Resumen <ChevronRight size={16} className="nav-chevron" /></a>
          <a href="#tendencias" onClick={() => setMenuOpen(false)}><Activity size={19} /> Tendencias</a>
          <a href="#alertas" onClick={() => setMenuOpen(false)}><Bell size={19} /> Alertas {alertsToShow.length > 0 && <span className="nav-count">{alertsToShow.length}</span>}</a>
        </nav>

        <div className="sidebar-bottom">
          <div className="device-card">
            <div className="device-icon"><Radio size={22} /></div>
            <div className="device-topline"><span>DISPOSITIVO</span><span className={`device-dot ${isLive && !sourceOnline ? 'offline-dot' : ''}`} /></div>
            <strong>{isLive ? backendData!.latest!.deviceId : 'ESP32 · Prototipo 01'}</strong>
            <p>{isLive ? 'Lecturas recibidas y guardadas por el servidor local.' : 'Vista previa con datos generados en este navegador.'}</p>
            <div className="device-divider" />
            <div className="device-footer"><span className={`pulse-dot ${isLive && !sourceOnline ? 'offline-dot' : ''}`} /> {isLive ? (sourceOnline ? 'Dispositivo activo' : 'Sin lecturas recientes') : (paused ? 'Simulación pausada' : 'Simulación activa')}</div>
          </div>
          <div className="sidebar-footnote">PROYECTO IoT <span>·</span> 2026</div>
        </div>
      </aside>

      <main className="main-content" id="resumen">
        <header className="topbar">
          <div className="topbar-left">
            <button className="mobile-menu icon-button" aria-label="Abrir menú" onClick={() => setMenuOpen(true)}><Menu size={23} /></button>
            <div className="breadcrumb">Panel de control <ChevronRight size={15} /> <strong>Resumen</strong></div>
          </div>
          <div className="topbar-right">
            <span className={`demo-pill ${isLive && !sourceOnline ? 'offline-pill' : ''}`}><span /> {isLive ? (sourceOnline ? 'DATOS DEL ESP32' : 'DISPOSITIVO SIN CONEXIÓN') : 'MODO DEMOSTRACIÓN'}</span>
            <span className="topbar-divider" />
            <span className="topbar-date"><Clock3 size={16} /> {dateText(new Date(clock))}</span>
          </div>
        </header>

        <div className="page-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">CENTRO DE MONITOREO <span /></div>
              <h1>Resumen del ambiente</h1>
              <p>Una vista clara de lo que ocurre en tu espacio, en cada momento.</p>
            </div>
            <div className="page-actions">
              {backendData?.latest && <button className="source-button" onClick={() => { manualDemo.current = !isLive; setViewMode(isLive ? 'demo' : 'live') }}>{isLive ? 'Ver demostración' : 'Ver datos del ESP32'}</button>}
              <button className="export-button" onClick={exportCsv}><Download size={17} /> Exportar lecturas</button>
            </div>
          </div>

          {!isLive && apiReachable && !backendData?.latest && <div className="connection-banner"><Radio size={17} /> Backend listo. Esperando la primera lectura del ESP32; mientras tanto se muestra la demostración.</div>}

          <section className={`status-hero status-${isLive && !sourceOnline ? 'offline' : activeScenario}`} aria-label="Estado general del espacio">
            <div className="hero-glow" />
            <div className="hero-content">
              <div className="hero-top"><span className="hero-kicker"><span className="hero-live-dot" /> ESTADO GENERAL DEL ESPACIO</span><span className="hero-time">Actualizado hace {secondsAgo} s</span></div>
              <div className="hero-main">
                <div className="hero-copy">
                  <div className="hero-state-icon">{activeScenario === 'danger' || (isLive && !sourceOnline) ? <TriangleAlert size={28} /> : <ShieldCheck size={28} />}</div>
                  <div className="hero-status-label">{statusCopy.label}</div>
                  <h2>{statusCopy.message}</h2>
                  <p>{statusCopy.hint}</p>
                  <div className="hero-chips">
                    <span><Wifi size={15} /> {isLive ? 'Datos del ESP32' : 'Datos simulados'}</span>
                    <span><Lightbulb size={15} /> {darkness ? 'Espacio a oscuras' : 'Espacio iluminado'}</span>
                  </div>
                </div>
                <div className="gas-gauge" style={{ '--gauge-fill': `${current.gas}%` } as React.CSSProperties}>
                  <div className="gas-gauge-inner"><span>NIVEL DE GAS</span><strong>{current.gas}<small>%</small></strong><em>valor relativo</em></div>
                </div>
              </div>
            </div>
          </section>

          <div className="section-row metric-heading"><div><h3>Lecturas actuales</h3><p>{isLive ? 'Últimas mediciones recibidas del ESP32' : 'Datos generados para esta demostración'}</p></div><span className="inline-live"><span /> {isLive ? 'Consulta cada 5 s' : 'Actualización cada 5 s'}</span></div>
          <section className="metric-grid" aria-label="Lecturas actuales">
            <article className="metric-card gas-card"><div className="metric-icon gas-icon"><Activity size={23} /></div><div className="metric-label">Gas en el ambiente</div><div className="metric-value">{current.gas}<span>%</span></div><div className="metric-bottom"><span>Escala relativa</span><span className={`metric-tag ${activeScenario}`}>{activeScenario === 'normal' ? 'Normal' : activeScenario === 'warning' ? 'Elevado' : 'Peligro'}</span></div><div className="mini-track"><span style={{ width: `${current.gas}%` }} /></div></article>
            <article className="metric-card"><div className="metric-icon temp-icon"><Thermometer size={23} /></div><div className="metric-label">Temperatura</div><div className="metric-value">{current.temperature.toFixed(1)}<span>°C</span></div><div className="metric-bottom"><span>Temperatura ambiente</span><span className="metric-muted">DHT11</span></div></article>
            <article className="metric-card"><div className="metric-icon humidity-icon"><Droplets size={23} /></div><div className="metric-label">Humedad relativa</div><div className="metric-value">{current.humidity}<span>%</span></div><div className="metric-bottom"><span>Humedad ambiente</span><span className="metric-muted">DHT11</span></div></article>
            <article className="metric-card"><div className="metric-icon light-icon"><Lightbulb size={23} /></div><div className="metric-label">Iluminación</div><div className="metric-value light-value">{darkness ? 'A oscuras' : 'Iluminado'}</div><div className="metric-bottom"><span>Luz relativa: {current.light}%</span><span className="metric-muted">LDR</span></div></article>
          </section>

          <div className="lower-grid">
            <section className="panel trend-panel" id="tendencias">
              <div className="panel-heading"><div><div className="panel-eyebrow">{isLive ? 'LECTURAS DEL DISPOSITIVO' : 'TENDENCIA DE LA DEMOSTRACIÓN'}</div><h3>Tendencia de gas</h3><p>Comportamiento de las últimas lecturas</p></div><span className="panel-period">Últimas lecturas</span></div>
              <div className="chart-legend"><span className="legend-dot" /> Nivel de gas <small>(valor relativo)</small></div>
              <GasChart readings={readingsToShow} live={isLive} />
            </section>

            {isLive ? <section className="panel simulator-panel" aria-labelledby="device-title">
              <div className="simulator-heading"><div className="sim-icon"><Radio size={20} /></div><span>CONEXIÓN DEL DISPOSITIVO</span></div>
              <h3 id="device-title">ESP32 conectado al panel</h3>
              <p>Las lecturas de esta vista provienen del backend y se conservan en el historial.</p>
              <div className="device-details">
                <div><span>Identificador</span><strong>{backendData!.latest!.deviceId}</strong></div>
                <div><span>Última lectura</span><strong>{timeText(current.time)}</strong></div>
                <div><span>Estado de conexión</span><strong className={sourceOnline ? 'online-text' : 'offline-text'}>{sourceOnline ? 'Reciente' : 'Sin datos recientes'}</strong></div>
                <div><span>Lecturas mostradas</span><strong>{readingsToShow.length}</strong></div>
              </div>
              <button className="pause-button" onClick={() => { manualDemo.current = true; setViewMode('demo') }}>Explorar demostración</button>
            </section> : <section className="panel simulator-panel" aria-labelledby="simulator-title">
              <div className="simulator-heading"><div className="sim-icon"><Radio size={20} /></div><span>HERRAMIENTA DE PRUEBA</span></div>
              <h3 id="simulator-title">Simula un escenario</h3>
              <p>Explora cómo responde el panel a diferentes condiciones. Estos datos no provienen de un sensor real.</p>
              <div className="scenario-options" role="group" aria-label="Escenario de demostración">
                <button className={`scenario-option ${scenario === 'normal' ? 'selected' : ''}`} onClick={() => changeScenario('normal')} aria-pressed={scenario === 'normal'}><span className="scenario-dot normal-dot" /><span><strong>Normal</strong><small>Condiciones seguras</small></span>{scenario === 'normal' && <Check size={17} />}</button>
                <button className={`scenario-option ${scenario === 'warning' ? 'selected' : ''}`} onClick={() => changeScenario('warning')} aria-pressed={scenario === 'warning'}><span className="scenario-dot warning-dot" /><span><strong>Advertencia</strong><small>Lectura elevada</small></span>{scenario === 'warning' && <Check size={17} />}</button>
                <button className={`scenario-option ${scenario === 'danger' ? 'selected' : ''}`} onClick={() => changeScenario('danger')} aria-pressed={scenario === 'danger'}><span className="scenario-dot danger-dot" /><span><strong>Posible fuga</strong><small>Activación de alarma</small></span>{scenario === 'danger' && <Check size={17} />}</button>
              </div>
              <button className="pause-button" onClick={() => setPaused((value) => !value)}>{paused ? <Play size={16} /> : <Pause size={16} />}{paused ? 'Reanudar lecturas' : 'Pausar lecturas'}</button>
            </section>}
          </div>

          <section className="panel alerts-panel" id="alertas">
            <div className="panel-heading alert-panel-heading"><div><div className="panel-eyebrow">ACTIVIDAD DEL SISTEMA</div><h3>Historial de alertas</h3><p>{isLive ? 'Advertencias y posibles fugas guardadas por el servidor' : 'Eventos generados durante esta demostración'}</p></div><span className="alert-counter">{alertsToShow.length} {alertsToShow.length === 1 ? 'evento' : 'eventos'}</span></div>
            {alertsToShow.length === 0 ? (
              <div className="empty-alerts"><div className="empty-icon"><Bell size={25} /></div><strong>Sin alertas por ahora</strong><p>Las advertencias y posibles fugas aparecerán aquí cuando se detecten.</p></div>
            ) : (
              <div className="alerts-list">{alertsToShow.map((alert) => (
                <div className="alert-row" key={alert.id}>
                  <div className={`alert-icon ${alert.kind}`}><TriangleAlert size={20} /></div>
                  <div className="alert-info"><strong>{alert.title}</strong><span>{alert.detail}</span></div>
                  <span className={`alert-badge ${alert.kind}`}>{alert.kind === 'danger' ? 'Peligro' : 'Advertencia'}</span>
                  <span className="alert-timestamp">{timeText(alert.time)}</span>
                  {!isLive && <button className={`ack-button ${alert.acknowledged ? 'done' : ''}`} onClick={() => setAlerts((previous) => previous.map((item) => item.id === alert.id ? { ...item, acknowledged: !item.acknowledged } : item))} aria-label={`${alert.acknowledged ? 'Marcar como pendiente' : 'Marcar como atendida'}: ${alert.title}`} title={alert.acknowledged ? 'Atendida' : 'Marcar como atendida'}><Check size={17} /></button>}
                </div>
              ))}</div>
            )}
          </section>

          <footer className="footer"><span>Vigía Gas · Prototipo académico IoT</span><span>{isLive ? 'Nivel de gas e iluminación expresados como valores relativos.' : 'Los datos de esta vista son simulados y no representan mediciones reales.'}</span></footer>
        </div>
      </main>
    </div>
  )
}

export default App
