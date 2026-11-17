# Firmware de Vigía Gas para Arduino IDE

Código independiente en `firmware/VigiaGasESP32/`, preparado para **ESP32 clásico con módulo ESP32-WROOM-32 / NodeMCU**, usando la placa **ESP32 Dev Module** en Arduino IDE. Los pines indicados no corresponden a ESP32-C3 ni ESP32-S3.

El firmware usa el API existente: `POST /api/readings`, JSON con `deviceId`, `gas`, `temperature`, `humidity`, `light`, y encabezado `x-api-key`. La computadora sigue encargándose del historial, dashboard y Telegram. El token del bot y la clave de administración no se colocan en el ESP32.

## 1. Instalar placa y librerías

En Arduino IDE 2.x:

1. Abre **Archivo > Preferencias** y agrega esta URL al gestor de placas:

   ```text
   https://espressif.github.io/arduino-esp32/package_esp32_index.json
   ```

2. En **Gestor de placas**, instala **esp32 by Espressif Systems**, versión **3.x**.
3. En **Gestor de bibliotecas**, instala:

   | Biblioteca | Autor |
   | --- | --- |
   | **DHT sensor library** | Adafruit |
   | **Adafruit Unified Sensor** | Adafruit |

   Si el IDE ofrece instalar las dependencias de DHT, acepta.

`WiFi`, `HTTPClient`, FreeRTOS y las funciones del ADC vienen con el paquete ESP32. Este código no utiliza ArduinoJson ni una biblioteca MQ: envía un valor relativo, no ppm.

Fuentes: [instalación oficial de Espressif](https://docs.espressif.com/projects/arduino-esp32/en/latest/installing.html), [biblioteca DHT de Adafruit y sus dependencias](https://github.com/adafruit/DHT-sensor-library).

## 2. Abrir y configurar el código

Abre **`firmware/VigiaGasESP32/VigiaGasESP32.ino`**. Mantén todos los archivos de esa carpeta juntos; el IDE muestra los `.h` como pestañas.

Copia `secrets.example.h` como **`secrets.h`** en la misma carpeta y cambia:

```cpp
constexpr char WIFI_SSID[] = "NOMBRE_DE_TU_WIFI";
constexpr char WIFI_PASSWORD[] = "PASSWORD_DE_TU_WIFI";
constexpr char API_URL[] = "http://192.168.1.100:3001/api/readings";
constexpr char DEVICE_API_KEY[] = "CLAVE_DEVICE_API_KEY_DE_BACKEND_ENV";
constexpr char DEVICE_ID[] = "esp32-01";
```

- Wi-Fi debe ser de **2.4 GHz**, con ESP32 y computadora en la misma red.
- Para encontrar la dirección de la computadora, ejecuta `ipconfig` en PowerShell y usa la IPv4 del adaptador conectado. Sustituye `192.168.1.100` por esa dirección. No uses `localhost` ni la IP que el ESP32 imprime para sí mismo.
- Copia el valor de **`DEVICE_API_KEY`** desde `backend/.env`. No uses `ADMIN_API_KEY` ni `TELEGRAM_BOT_TOKEN`.
- El puerto del backend es `3001`, no el `5173` de Vite. Esta versión usa HTTP dentro de la red local.
- `secrets.h` está excluido de Git. No pegues credenciales en `secrets.example.h` ni en archivos compartidos.

## 3. Primera prueba sin sensores

En `settings.h`, los valores iniciales son:

```cpp
constexpr bool SIMULATION_MODE = true;
constexpr bool ENABLE_ACTUATORS = false;
```

Conecta solamente el ESP32 por USB. No se necesitan sensores ni actuadores para esta prueba.

1. Desde la raíz del repositorio ejecuta `npm run dev` en la computadora.
2. En Arduino IDE selecciona **ESP32 Dev Module**, el puerto COM de la placa y una velocidad de carga de `115200` si tienes problemas con velocidades superiores.
3. Pulsa **Verificar** y después **Subir**. Si la placa permanece en `Connecting...`, mantén BOOT presionado al iniciar la carga y suéltalo cuando comience a escribir.
4. Abre **Monitor Serie** a **115200 baudios**. Debe mostrar la IP del ESP32 y, aproximadamente cada cinco segundos, `[HTTP] 201: lectura guardada en el backend.`
5. Abre el dashboard en la computadora: `http://127.0.0.1:5173`. Cambiará a datos del dispositivo; el identificador termina en **`-demo`** para reconocer esta prueba.

Los comandos del Monitor Serie son letras minúsculas; puedes usar cualquier opción de fin de línea:

| Envía | Resultado en el siguiente ciclo de envío |
| --- | --- |
| `n` | Normal: gas 18%, temperatura 25.4 °C, humedad 61%, luz 72%. |
| `a` | Advertencia: gas 44%, temperatura 31.2 °C, humedad 70%, luz 72%. |
| `p` | Posible fuga simulada: gas 76%, temperatura 31.2 °C, humedad 70%, luz 12%. |
| `s` | Silenciar el buzzer de un episodio de peligro, si los actuadores están habilitados. |

**Los datos de este modo se guardan en el historial real. Los comandos `a` y `p` pueden enviar avisos reales a todos los destinatarios activos de Telegram.** Informa a los participantes que harás una demostración. Para validar solamente un teléfono, deja activo ese destinatario en el dashboard.

Prueba `n`, espera un envío correcto, luego `a`, espera otro y luego `p`. No se genera un aviso por cada lectura repetida; el backend notifica al entrar en advertencia o peligro. Para repetir la secuencia, vuelve a `n` y espera el envío antes de cambiar otra vez. Los botones del simulador del navegador siguen siendo una demostración local y no envían lecturas al API.

`HTTP 201` confirma el registro de la lectura; no confirma por sí mismo la entrega de Telegram. El bot debe estar configurado, con destinatarios activos que hayan iniciado su conversación.

## 4. Cableado para sensores reales

Desconecta la alimentación antes de montar el circuito. Todos los GND deben tener una referencia común. Guíate por los nombres de las terminales impresos en los módulos, no por su posición física.

| Componente | Conexión de señal al ESP32 | Alimentación / detalle |
| --- | --- | --- |
| MQ-5 KS0043 | AO/S analógica → divisor → **GPIO34** | Módulo a **5 V**; salida reducida antes del ESP32. |
| DHT11 KY015 | DATA/S → **GPIO27** | Módulo compatible a **3.3 V**, GND común. |
| LDR | Punto central de divisor → **GPIO35** | `3.3 V → LDR → punto central → 10 kΩ → GND`. |
| RGB rojo | **GPIO25** → resistencia 330 Ω → rojo | Común del LED de ánodo común a 3.3 V. |
| RGB verde | **GPIO26** → resistencia 330 Ω → verde | Una resistencia por color. |
| RGB azul | **GPIO33** → resistencia 330 Ω → azul | Azul no se utiliza como estado de alarma. |
| Buzzer | **GPIO32** → resistencia 1 kΩ → base del NPN | Alimentación a través del transistor; ver abajo. |
| Tarjeta de relés | **GPIO23** → entrada de control compatible | Alimentación de la tarjeta según fabricante. |
| Pulsador | **GPIO18** ↔ pulsador ↔ GND | El código habilita `INPUT_PULLUP`. |

### MQ-5: divisor obligatorio

```text
Salida analogica MQ-5 ---- 10 kohm ----+---- GPIO34
                                      |
                                   10 kohm
                                      |
                                     GND
```

Con dos resistencias iguales, 5 V de salida se reducen aproximadamente a 2.5 V. No conectes la salida de 5 V directamente al GPIO. El calentador se alimenta desde una fuente de 5 V adecuada, no desde un GPIO ni desde la salida de 3.3 V del ESP32. El [KS0043 especifica operación a 5 V](https://wiki.keyestudio.com/Ks0043_keyestudio_MQ-5_Gas_Sensor).

GPIO34 y GPIO35 pertenecen a ADC1 en el ESP32 clásico. La resolución del código es de 12 bits: `0..4095`. Con atenuación de 11 dB, Espressif documenta un rango de medida aproximado de hasta 3.1 V para ese chip; el LDR puede saturar cerca de su extremo de 3.3 V. Usa las lecturas reales de tu montaje para sus referencias. [Documentación ADC](https://docs.espressif.com/projects/arduino-esp32/en/latest/api/adc.html).

Si el DHT11 de tu módulo necesita una alimentación distinta, revisa su ficha y adapta el nivel de DATA antes del GPIO; su señal no debe subir a 5 V. Si es un DHT11 sin módulo o sin pull-up, agrega una resistencia de 4.7 a 10 kΩ entre DATA y 3.3 V.

### Buzzer y relé

En el NPN: emisor a GND, colector al negativo del buzzer y positivo del buzzer a su alimentación. Identifica base, emisor y colector con la ficha del MPS2222A concreto; no asumas el orden de otro transistor. Si la carga es inductiva, utiliza su protección de retorno correspondiente.

El programa puede generar un tono de 4 kHz para un buzzer pasivo (`BUZZER_PASSIVE=true`); para uno activo que suena al aplicar DC, usa `false`.

Confirma que la entrada de la tarjeta de relés acepta control de 3.3 V. Si necesita otro nivel, utiliza una interfaz de transistor o adaptación; no conectes una entrada que devuelva 5 V al GPIO. `RELAY_ACTIVE_LOW=true` significa que el relé se activa con LOW. Verifica ese comportamiento con una carga de prueba antes de habilitarlo. Las entradas deben mantenerse en su nivel inactivo también durante el reinicio mediante la interfaz y resistencias apropiadas.

El contacto del relé solo representa el extractor o la válvula mediante una carga de bajo voltaje. Mantén este montaje fuera de una instalación real de gas y de la red de 120 V.

## 5. Activar sensores y definir referencias

1. Monta el circuito y cambia `SIMULATION_MODE=false`. Mantén `CALIBRATION_CONFIRMED=false`.
2. El Monitor Serie mostrará las lecturas crudas `MQ5 raw` y `LDR raw`. Durante esta fase no se envían lecturas al backend ni se declara un ambiente normal.
3. Espera que el MQ-5 se estabilice. **El manual de Winsen indica al menos 48 horas de precalentamiento en sus condiciones de ensayo.** Los tres minutos del código son una espera inicial ilustrativa por arranque; no sustituyen el acondicionamiento ni garantizan estabilidad en un sensor nuevo. Ajusta `MQ5_WARMUP_MS` según el módulo y sus lecturas. [Manual del fabricante](https://www.winsen-sensor.com/d/files/manual/mq-5.pdf).
4. En aire limpio estable, toma el valor promedio `MQ5 raw` como `GAS_RAW_ZERO`. `GAS_RAW_SPAN` define cuánto incremento ADC representa el 100% de **esta escala relativa**: no equivale al 100% de gas ni al límite de explosividad. El cero más el intervalo no debe superar 4095. Los valores `800` y `2200` del archivo son ejemplos, no una calibración de fábrica.
5. Guarda las lecturas del LDR a oscuras y con luz en `LDR_RAW_DARK` y `LDR_RAW_BRIGHT`. Si la orientación del divisor es inversa, las referencias pueden quedar en orden inverso; la fórmula lo admite.
6. Ajusta `GAS_WARNING`, `GAS_DANGER` y `TEMP_WARNING` a los mismos valores configurados en el backend. La referencia de gas y los umbrales requieren validación experimental; no liberes gas de un cilindro para obtener los puntos de prueba. Usa primero los escenarios por software para comprobar las alarmas.
7. Cambia `CALIBRATION_CONFIRMED=true` y vuelve a cargar. Tras la espera de arranque y una lectura DHT11 válida, empezará el envío de sensores reales.
8. Si montaste las salidas, cambia `ENABLE_ACTUATORS=true` después de verificar niveles, corriente y polaridades.

La escala utilizada es:

```text
gas_relativo = limitar(100 * (MQ5_raw - GAS_RAW_ZERO) / GAS_RAW_SPAN, 0, 100)
luz_relativa = limitar(100 * (LDR_raw - LDR_RAW_DARK) / (LDR_RAW_BRIGHT - LDR_RAW_DARK), 0, 100)
```

No se calcula ppm ni se compensa el MQ-5 con la temperatura; DHT11 aporta contexto al registro, tal como plantea el anteproyecto.

## 6. Comportamiento local y fallos

- Verde: normal; amarillo: advertencia; rojo: peligro. Peligro activa buzzer y relé. Se aplica histéresis de 5 puntos de gas y 1 °C, igual que en el backend.
- Pulsador o `s`: silencia el buzzer durante el episodio actual. El rojo y el relé se mantienen. Al salir de peligro se restablece la posibilidad de alarmar en el siguiente episodio.
- Una tarea separada maneja HTTP y Wi-Fi para que esperar al servidor no detenga la lectura del pulsador ni el control local.
- Si se pierde Wi-Fi, continúa el control local. Se intenta reconectar aproximadamente cada diez segundos. Se guarda únicamente la muestra pendiente más reciente; no hay un historial offline en el ESP32.
- Si falla el DHT11, no se inventan valores para el API: se detiene el envío, la lectura de gas continúa y el LED pasa a amarillo si no hay peligro. Los datos viejos no se reutilizan como mediciones nuevas.
- El buzzer, relé y LED no se controlan desde el dashboard; el ESP32 los gestiona localmente.

| Síntoma | Revisar |
| --- | --- |
| `HTTP 401` | La clave del dispositivo debe coincidir con `backend/.env`. |
| `HTTP 400` | Identificador del dispositivo y rangos de los datos. |
| `HTTP 503` | `DEVICE_API_KEY` configurada en el servidor. |
| Error HTTP negativo o timeout | IP de la computadora, puerto 3001, Wi-Fi compartida, aislamiento de clientes y firewall de red privada. |
| `DHT.h: No such file` | Instalar DHT sensor library y Adafruit Unified Sensor desde el gestor. |
| `secrets.h` ausente | Copiar la plantilla en la misma carpeta del `.ino`. |
| No aparece COM | Cable USB con datos y controlador CP210x correspondiente a la placa. |
| ADC siempre 4095 o 0 | Conexiones, divisor, GND común y voltaje medido antes de conectar el GPIO. |

Esta es una prueba académica de integración, no un detector de gas certificado.

## Verificación del código

Se compilaron correctamente el modo inicial de simulación y una variante con sensores, actuadores y red habilitados usando Arduino CLI 1.6.0, **esp32 by Espressif Systems 3.3.12**, **DHT sensor library 1.4.7** y **Adafruit Unified Sensor 1.1.15**, con placa `esp32:esp32:esp32` (ESP32 Dev Module).

La variante completa utiliza 950835 bytes de programa (72%) y 48708 bytes de variables globales (14%). La verificación fue de compilación: no se cargó a una placa ni se validaron sensores, conexiones o calibración física. Los datos utilizados para compilar fueron ficticios.
