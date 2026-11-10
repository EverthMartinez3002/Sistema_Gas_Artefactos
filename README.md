# Vigía Gas

Dashboard de demostración para el proyecto IoT de detección de gas. Está construido con React, TypeScript y Vite.

## Ejecutar

```bash
npm install
npm run dev
```

Abre la dirección local que muestra Vite (normalmente `http://localhost:5173`). Para generar la versión de producción:

```bash
npm run build
```

## Versión actual

- Muestra nivel relativo de gas, temperatura, humedad, iluminación y estado general.
- Presenta una tendencia de las últimas lecturas y un historial de alertas.
- Permite simular los estados normal, advertencia y posible fuga, pausar la simulación, marcar alertas como atendidas y exportar lecturas a CSV.
- Funciona en escritorio y móvil.

**Todos los datos son simulados y viven solo en la memoria del navegador.** Al recargar la página, la demostración empieza de nuevo. Todavía no hay conexión con ESP32, backend, base de datos ni Telegram.

## Siguiente etapa

Conectar el panel a un backend sencillo que reciba lecturas del ESP32, guarde el historial y exponga las lecturas y alertas al frontend. El nivel de gas seguirá identificado como *valor relativo* hasta definir su calibración.
