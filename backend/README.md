# Vigía Gas · Backend

API sencilla en Node.js para el prototipo IoT. Recibe las lecturas relativas del ESP32, calcula el estado del ambiente, guarda el historial en archivos diarios y envía las nuevas advertencias a Telegram cuando el bot está configurado. No requiere instalar paquetes de npm; basta Node.js 20 o posterior.

## Iniciar

En PowerShell, desde esta carpeta, si todavía no existe `.env`:

```powershell
Copy-Item .env.example .env
```

Comprueba que `DEVICE_API_KEY` en `.env` contiene una clave privada distinta del valor de ejemplo. Después ejecuta:

```powershell
npm run dev
```

El servidor escucha por defecto en el puerto `3001`. `HOST=0.0.0.0` permite que el ESP32 lo alcance desde la misma red Wi-Fi. En el firmware se debe usar la **IP local de la computadora**, no `localhost`. Si Windows pregunta por el acceso a la red, permite la red privada utilizada para la prueba.

## Enviar una lectura

El ESP32 debe enviar cada lectura mediante `POST http://IP_DE_LA_COMPUTADORA:3001/api/readings`, con `Content-Type: application/json` y el encabezado `x-api-key` igual al configurado en `.env`.

```json
{
  "deviceId": "esp32-01",
  "gas": 18,
  "temperature": 25.4,
  "humidity": 61,
  "light": 72
}
```

`gas` y `light` son **valores relativos de 0 a 100**, ya normalizados a partir de la calibración local. No representan ppm ni una medición certificada. El servidor asigna la fecha y hora de recepción.

Para probarlo manualmente desde PowerShell:

```powershell
$headers = @{ 'x-api-key' = 'LA_CLAVE_DE_TU_ENV' }
$body = '{"deviceId":"esp32-01","gas":18,"temperature":25.4,"humidity":61,"light":72}'
Invoke-RestMethod -Uri 'http://localhost:3001/api/readings' -Method Post -Headers $headers -ContentType 'application/json' -Body $body
```

## Consultas para el dashboard

| Ruta | Contenido |
| --- | --- |
| `GET /api/health` | Estado del servidor y configuración disponible |
| `GET /api/dashboard` | Última lectura, últimas 30 lecturas, 50 alertas, estado y conexión reciente |
| `GET /api/readings?limit=100` | Historial de lecturas, hasta 500 por consulta |
| `GET /api/alerts?limit=50` | Historial de alertas, hasta 200 por consulta |

Las lecturas y alertas se guardan como archivos `.ndjson` por día en `data/`. La carpeta se crea automáticamente y está excluida de Git. Una lectura se considera reciente durante 30 segundos.

## Alertas y Telegram

Los umbrales iniciales de `.env.example` son provisionales: gas de advertencia `35`, gas de peligro `60`, temperatura de advertencia `30 °C` y oscuridad por debajo de `30`. Se deben ajustar con las referencias tomadas durante la calibración. El servidor utiliza una pequeña histéresis para evitar cambios repetidos cerca de cada umbral y crea alertas al **entrar** en advertencia o peligro.

Para enviar mensajes al celular, configura `TELEGRAM_BOT_TOKEN` en `.env` y agrega destinatarios desde la sección **Destinatarios** del dashboard. Cada persona debe haber iniciado una conversación con el bot. Las alertas se envían a todos los destinatarios activos; el fallo de un chat no impide enviar a los demás. La respuesta del `POST` indica `telegram: "partial"` cuando solo una parte de los envíos funciona, o `"failed"` si todos fallan. Actualmente no hay reintento automático de mensajes fallidos.

### Administrar destinatarios desde el dashboard

1. Define una clave privada `ADMIN_API_KEY` en `backend/.env`, distinta de la clave del dispositivo. En este equipo ya se generó una. Reinicia el backend si cambias `.env`.
2. En el dashboard, abre **Destinatarios** e ingresa esa clave. Solo se conserva en memoria hasta bloquear la sección o recargar la página.
3. Pide a cada persona enviar `hola` al bot. Pulsa **Buscar personas en el bot**, selecciona el chat y guarda un nombre para identificarlo. También puedes ingresar un ID de chat conocido.
4. Usa el interruptor para activar o desactivar sus alertas. **Probar** envía únicamente a esa persona un mensaje identificado como prueba. Puedes editar o eliminar cada destinatario.

Telegram utiliza IDs de chat para enviar mensajes, no números de teléfono. La búsqueda consulta mensajes recientes; si una persona no aparece, pídele enviar otro mensaje al bot. No se eliminan webhooks ni se consumen actualizaciones de otros servicios.

Los destinatarios se guardan en `backend/data/telegram-recipients.json`, excluido de Git. En el primer arranque se importa `TELEGRAM_CHAT_ID` como **Destinatario inicial**. Después esa lista es la fuente de configuración: desactivar o borrar todos los destinatarios detiene los envíos sin restaurar el ID antiguo. Los cambios del dashboard no requieren reiniciar.

Las rutas `/api/telegram/settings`, `/api/telegram/chats` y `/api/telegram/recipients` requieren el encabezado `x-admin-key`. La clave del ESP32 no permite administrar los destinos. Se admiten hasta 20 destinatarios y se rechazan chats duplicados.

Configuración inicial por terminal (antes del primer arranque del backend):

1. En Telegram, abre [@BotFather](https://t.me/BotFather), envía `/newbot` y elige nombre y usuario para el bot.
2. Guarda el token recibido en `TELEGRAM_BOT_TOKEN` dentro de `backend/.env`.
3. Abre tu bot y envía `/start`.
4. Ejecuta `npm run telegram:setup`. Verifica el bot, detecta el chat y guarda su ID en `.env`. Si encuentra varios chats, muestra los IDs para que elijas con `npm run telegram:setup -- ID_DEL_CHAT`.
5. Ejecuta `npm run telegram:test` para enviar un mensaje marcado como prueba a los destinatarios activos.
6. Reinicia el backend después de modificar `.env`.

El token y el ID permanecen en la configuración local, excluida de Git. La configuración guiada no elimina webhooks de otros servicios. Las alertas salientes utilizan [sendMessage de la API oficial de Telegram](https://core.telegram.org/bots/api#sendmessage) y no necesitan una URL pública para recibir webhooks.

## Frontend

El dashboard Vite desarrollado antes consulta `/api/dashboard` cada cinco segundos. Durante el desarrollo, su proxy apunta a `http://127.0.0.1:3001`. Si no hay lecturas reales, muestra la demostración; al llegar la primera lectura cambia a los datos del ESP32 y permite volver a la demostración desde la interfaz.

Para usar un frontend servido desde otro origen, configura `FRONTEND_ORIGINS` con los orígenes permitidos, separados por comas. Para una compilación desplegada se puede definir `VITE_API_BASE_URL` con la URL pública del API antes de ejecutar `npm run build` en el frontend.

## Verificación

```powershell
npm test
```

El prototipo no sustituye a un detector de gas certificado. El buzzer, el relé y el pulsador se controlarán directamente desde el firmware del ESP32, independientemente de la conexión al backend.
