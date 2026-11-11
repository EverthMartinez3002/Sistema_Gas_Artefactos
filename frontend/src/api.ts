export type ApiReading = {
  id: string
  time: string
  deviceId: string
  gas: number
  temperature: number
  humidity: number
  light: number
  state: 'normal' | 'warning' | 'danger'
}

export type ApiAlert = {
  id: string
  time: string
  deviceId: string
  kind: 'warning' | 'danger'
  title: string
  detail: string
  acknowledged: boolean
}

export type DashboardData = {
  latest: ApiReading | null
  readings: ApiReading[]
  alerts: ApiAlert[]
  state: 'normal' | 'warning' | 'danger' | 'unknown'
  online: boolean
}

const apiBase = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')

export async function getDashboard(): Promise<DashboardData> {
  const response = await fetch(`${apiBase}/dashboard`, { cache: 'no-store' })
  if (!response.ok) throw new Error(`El servidor respondió ${response.status}`)
  return response.json() as Promise<DashboardData>
}
