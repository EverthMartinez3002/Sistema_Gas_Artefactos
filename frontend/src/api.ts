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

export type Recipient = { id: string; name: string; chatId: string; enabled: boolean }
export type TelegramSettingsData = { configured: boolean; recipients: Recipient[] }
export type TelegramChats = { botUsername: string; chats: { chatId: string; name: string }[] }

export async function telegramApi<T>(key: string, path: string, method = 'GET', body?: Omit<Recipient, 'id'>): Promise<T> {
  const response = await fetch(`${apiBase}/telegram/${path}`, {
    method, headers: { 'x-admin-key': key, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined, cache: 'no-store',
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error || 'No se pudo completar la solicitud')
  return result as T
}

export async function getDashboard(): Promise<DashboardData> {
  const response = await fetch(`${apiBase}/dashboard`, { cache: 'no-store' })
  if (!response.ok) throw new Error(`El servidor respondió ${response.status}`)
  return response.json() as Promise<DashboardData>
}
