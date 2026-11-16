import { useState, type FormEvent } from 'react'
import { Check, LockKeyhole, Pencil, Plus, Search, Send, Trash2, Users, X } from 'lucide-react'
import { telegramApi, type Recipient, type TelegramChats, type TelegramSettingsData } from './api'

const emptyForm = { name: '', chatId: '', enabled: true }

export default function TelegramSettings() {
  const [key, setKey] = useState('')
  const [settings, setSettings] = useState<TelegramSettingsData | null>(null)
  const [chats, setChats] = useState<TelegramChats | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [editing, setEditing] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ error: boolean; text: string } | null>(null)
  const activeCount = settings?.recipients.filter((item) => item.enabled).length ?? 0

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setFeedback(null)
    try { await action() }
    catch (error) { setFeedback({ error: true, text: error instanceof Error ? error.message : 'No se pudo conectar con el servidor' }) }
    finally { setBusy(false) }
  }
  async function refresh() { setSettings(await telegramApi<TelegramSettingsData>(key, 'settings')) }
  function save(event: FormEvent) {
    event.preventDefault()
    void run(async () => {
      await telegramApi(key, editing ? `recipients/${editing}` : 'recipients', editing ? 'PATCH' : 'POST', form)
      await refresh()
      setForm(emptyForm)
      setEditing(null)
      setFeedback({ error: false, text: 'Destinatario guardado. Los próximos avisos usarán esta configuración.' })
    })
  }
  function toggle(recipient: Recipient) {
    void run(async () => {
      await telegramApi(key, `recipients/${recipient.id}`, 'PATCH', { ...recipient, enabled: !recipient.enabled })
      await refresh()
    })
  }

  return <section className="panel telegram-panel" id="destinatarios" aria-labelledby="telegram-title">
    <div className="panel-heading"><div><div className="panel-eyebrow">AVISOS AL CELULAR</div><h3 id="telegram-title">Destinatarios de Telegram</h3><p>Elige quién recibe las advertencias y posibles fugas.</p></div><span className="telegram-heading-icon"><Users size={23} /></span></div>
    <div className="telegram-explainer"><Send size={18} /><p>Cada persona debe abrir el bot de Vigía Gas en su teléfono y enviar <strong>/start</strong> o <strong>hola</strong>. Después puedes vincular su chat aquí. Los avisos llegarán a Telegram.</p></div>
    {feedback && <div className={`telegram-feedback ${feedback.error ? 'error' : 'success'}`} role={feedback.error ? 'alert' : 'status'}>{feedback.error ? <X size={17} /> : <Check size={17} />}{feedback.text}</div>}

    {!settings ? <form className="telegram-unlock" onSubmit={(event) => { event.preventDefault(); void run(refresh) }}>
      <div className="telegram-lock"><LockKeyhole size={20} /><div><strong>Administrar destinatarios</strong><p>Ingresa la clave de administración para cambiar quién recibe los mensajes.</p></div></div>
      <div className="telegram-unlock-fields"><label htmlFor="admin-key">Clave de administración<input id="admin-key" type="password" value={key} onChange={(event) => setKey(event.target.value)} autoComplete="off" required placeholder="Ingresa tu clave" /></label><button className="telegram-primary" type="submit" disabled={busy}>{busy ? 'Conectando…' : 'Acceder'}</button></div>
      <p className="telegram-help">En esta instalación, la clave corresponde a ADMIN_API_KEY en backend/.env.</p>
    </form> : <>
      <div className="telegram-toolbar"><span><span className={`scenario-dot ${settings.configured ? 'normal-dot' : 'warning-dot'}`} />{settings.configured ? `${activeCount} ${activeCount === 1 ? 'destinatario activo' : 'destinatarios activos'}` : 'El bot necesita configurar su token'}</span><button disabled={busy} className="telegram-text-button" onClick={() => { setSettings(null); setKey(''); setChats(null); setForm(emptyForm); setEditing(null); setFeedback(null) }}><LockKeyhole size={14} /> Bloquear sección</button></div>
      <div className="telegram-columns"><div className="telegram-list"><h4>Personas que reciben avisos</h4>
        {settings.recipients.length === 0 && <div className="telegram-empty"><Users size={28} /><strong>Aún no hay destinatarios</strong><p>Agrega una persona para empezar a enviar las alertas.</p></div>}
        {settings.recipients.map((recipient) => <article key={recipient.id} className={`recipient-card ${!recipient.enabled ? 'recipient-disabled' : ''}`}>
          <div className="recipient-header"><div className="recipient-avatar">{recipient.name.slice(0, 1).toUpperCase()}</div><div className="recipient-info"><strong>{recipient.name}</strong><span>Chat {recipient.chatId}</span></div><button className="recipient-switch" role="switch" aria-checked={recipient.enabled} aria-label={`Recibir avisos: ${recipient.name}`} disabled={busy} onClick={() => toggle(recipient)}><span /></button></div>
          <div className="recipient-footer"><span>{recipient.enabled ? 'Recibe alertas' : 'Avisos desactivados'}</span><div className="recipient-actions">
            <button disabled={busy || !settings.configured} onClick={() => void run(async () => { await telegramApi(key, `recipients/${recipient.id}/test`, 'POST'); setFeedback({ error: false, text: `Mensaje de prueba enviado a ${recipient.name}.` }) })}><Send size={13} /> Probar</button>
            <button disabled={busy} aria-label={`Editar ${recipient.name}`} title="Editar destinatario" onClick={() => { setEditing(recipient.id); setForm({ name: recipient.name, chatId: recipient.chatId, enabled: recipient.enabled }); setFeedback(null) }}><Pencil size={14} /></button>
            <button disabled={busy} aria-label={`Eliminar ${recipient.name}`} title="Eliminar destinatario" onClick={() => setDeleting(recipient.id)}><Trash2 size={14} /></button>
          </div></div>
          {deleting === recipient.id && <div className="recipient-delete"><span>¿Eliminar a {recipient.name}?</span><button disabled={busy} onClick={() => void run(async () => { await telegramApi(key, `recipients/${recipient.id}`, 'DELETE'); await refresh(); setDeleting(null); if (editing === recipient.id) { setEditing(null); setForm(emptyForm) } })}>Eliminar</button><button disabled={busy} onClick={() => setDeleting(null)}>Cancelar</button></div>}
        </article>)}
      </div><div className="telegram-add">
        <div className="telegram-add-heading"><h4>{editing ? 'Editar destinatario' : 'Vincular otra persona'}</h4>{editing && <button className="telegram-text-button" disabled={busy} onClick={() => { setEditing(null); setForm(emptyForm) }}>Cancelar</button>}</div>
        <button className="telegram-search" disabled={busy || !settings.configured} onClick={() => void run(async () => { const data = await telegramApi<TelegramChats>(key, 'chats', 'POST'); setChats(data); if (!data.chats.length) setFeedback({ error: false, text: 'No hay chats recientes. Pide a la persona enviar hola al bot y vuelve a buscar.' }) })}><Search size={16} />{busy ? 'Procesando…' : 'Buscar personas en el bot'}</button>
        {chats && <div className="telegram-discovered"><p>Bot: <a href={`https://t.me/${chats.botUsername}`} target="_blank" rel="noreferrer">@{chats.botUsername}</a></p>{chats.chats.map((chat) => <button key={chat.chatId} disabled={busy || settings.recipients.some((item) => item.chatId === chat.chatId)} onClick={() => { setEditing(null); setForm({ ...chat, enabled: true }) }}><span>{chat.name}<small>Chat {chat.chatId}</small></span>{settings.recipients.some((item) => item.chatId === chat.chatId) ? 'Vinculado' : 'Seleccionar'}</button>)}</div>}
        <form onSubmit={save} className="recipient-form">
          <label htmlFor="recipient-name">Nombre<input id="recipient-name" placeholder="Ej. Responsable de cafetería" value={form.name} maxLength={80} required onChange={(event) => setForm({ ...form, name: event.target.value })} disabled={busy} /></label>
          <label htmlFor="recipient-chat">ID del chat de Telegram<input id="recipient-chat" placeholder="Selecciona un chat o ingresa su ID" value={form.chatId} required pattern="-?[1-9][0-9]{0,15}" onChange={(event) => setForm({ ...form, chatId: event.target.value })} disabled={busy} /></label>
          <p className="telegram-help">La búsqueda completa estos datos. También puedes ingresar un ID conocido. No se utiliza el número de teléfono.</p>
          <button className="telegram-primary" type="submit" disabled={busy}>{editing ? <Check size={16} /> : <Plus size={16} />}{editing ? 'Guardar cambios' : 'Agregar destinatario'}</button>
        </form>
      </div></div>
      <p className="telegram-help telegram-persistence">Los destinatarios se guardan en el servidor y se conservan al cerrar esta página.</p>
    </>}
  </section>
}
