# Vigía Gas

Dashboard para el proyecto IoT de detección de gas. Está construido con React, TypeScript y Vite.

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
- Permite simular los estados normal, advertencia y posible fuga, pausar la simulación, marcar sus alertas como atendidas y exportar lecturas a CSV.
- Funciona en escritorio y móvil.

La demostración usa datos simulados que viven solo en la memoria del navegador. Al recargar la página, esa demostración empieza de nuevo.

Si el backend Vigía Gas está ejecutándose en el puerto `3001`, Vite redirige `/api` hacia él. Cuando el backend recibe la primera lectura, el panel cambia automáticamente a los datos del ESP32: muestra su estado, lecturas e historial persistido. El botón de origen permite volver a la demostración. El frontend no almacena la clave del dispositivo ni envía lecturas.

## Siguiente etapa

Preparar el firmware del ESP32 para enviar lecturas al backend y controlar localmente LED, buzzer, relé y pulsador. El nivel de gas seguirá identificado como *valor relativo* hasta definir su calibración.
