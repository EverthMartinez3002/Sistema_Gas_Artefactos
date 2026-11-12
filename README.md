# Vigía Gas

Proyecto IoT de monitoreo de gas. El código está organizado en dos carpetas:

| Carpeta | Función |
| --- | --- |
| [`frontend/`](frontend/) | Dashboard React + Vite: lecturas, tendencia, estado e historial de alertas. |
| [`backend/`](backend/) | API Node.js: recepción del ESP32, clasificación, almacenamiento y avisos por Telegram. |

## Preparación

Se necesita Node.js 20 o posterior. Desde esta carpeta:

```powershell
npm --prefix frontend ci
```

En `backend/.env` se configura la clave privada del ESP32 y, si se desea, el bot de Telegram. En este equipo ya existe una clave generada. Si se prepara otra copia del proyecto, crea el archivo desde `backend/.env.example` y cambia la clave de ejemplo.

## Ejecutar todo

```powershell
npm run dev
```

El dashboard estará en `http://127.0.0.1:5173` y el API en el puerto `3001`. Se detienen ambos procesos con `Ctrl+C`. También se pueden iniciar por separado con `npm run dev:backend` y `npm run dev:frontend` en dos terminales.

El frontend muestra datos de demostración hasta que el backend recibe la primera lectura. Después presenta las lecturas y alertas guardadas, con un botón para volver a la demostración.

## Verificar

```powershell
npm test
npm run build
```

Consulta [`backend/README.md`](backend/README.md) para el formato de lecturas, las rutas del API y la configuración de Telegram. Consulta [`frontend/README.md`](frontend/README.md) para los detalles del dashboard.

Para conectar Telegram, guarda el token de BotFather en `backend/.env`, inicia la conversación con tu bot y ejecuta `npm run telegram:setup`. Después prueba la conexión con `npm run telegram:test`. Nunca agregues `backend/.env` al repositorio.

El repositorio de GitHub conserva el código fuente. Para recibir alertas, el backend debe mantenerse ejecutándose en una computadora con Internet o en un servidor; subir el código a GitHub no inicia ese proceso.

El nivel de gas se expresa como valor relativo y requiere calibración del sensor. El prototipo académico no sustituye a un detector certificado.
