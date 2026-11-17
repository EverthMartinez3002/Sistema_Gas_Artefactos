/*
 * Vigia Gas - ESP32 clasico / Arduino IDE.
 * Lee firmware/README.md antes de conectar el circuito.
 * Monitor Serie 115200: n=normal, a=advertencia, p=peligro, s=silenciar.
 * Los escenarios de prueba se envian al backend y pueden generar Telegram.
 */
#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <DHT.h>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>
#include <freertos/queue.h>
#include <math.h>
#include "settings.h"
#include "model.h"
#if __has_include("secrets.h")
#include "secrets.h"
#else
#error "Copia secrets.example.h como secrets.h y configura Wi-Fi, API_URL y DEVICE_API_KEY."
#endif
#if !defined(CONFIG_IDF_TARGET_ESP32)
#error "Este montaje usa ESP32 clasico/WROOM-32. Selecciona ESP32 Dev Module."
#endif

static_assert(GAS_RAW_SPAN > 0 && GAS_RAW_ZERO >= 0 && GAS_RAW_ZERO + GAS_RAW_SPAN <= 4095, "Escala MQ-5 invalida");
static_assert(LDR_RAW_DARK != LDR_RAW_BRIGHT, "Las referencias del LDR deben ser diferentes");
static_assert(GAS_WARNING > 5 && GAS_WARNING < GAS_DANGER && GAS_DANGER <= 100, "Umbrales de gas invalidos");

DHT dht(PIN_DHT, DHT11);
QueueHandle_t telemetryQueue = nullptr;
EnvironmentState state = EnvironmentState::Normal;
char demoScenario = 'n';
bool buzzerMuted = false;
bool buzzerWasOn = false;
bool dhtSeen = false;
float temperature = NAN;
float humidity = NAN;
int gasRaw = 0;
int ldrRaw = 0;
float gas = 0;
float light = 0;
uint32_t bootAt = 0;
uint32_t lastDhtOk = 0;

float scaleRelative(int raw, int zero, int span) {
  const float percent = 100.0f * (raw - zero) / span;
  return constrain(percent, 0.0f, 100.0f);
}

void rgb(bool red, bool green, bool blue) {
  if (!ENABLE_ACTUATORS) return;
  digitalWrite(PIN_RED, red != RGB_COMMON_ANODE ? HIGH : LOW);
  digitalWrite(PIN_GREEN, green != RGB_COMMON_ANODE ? HIGH : LOW);
  digitalWrite(PIN_BLUE, blue != RGB_COMMON_ANODE ? HIGH : LOW);
}

void relay(bool on) {
  if (ENABLE_ACTUATORS) digitalWrite(PIN_RELAY, on != RELAY_ACTIVE_LOW ? HIGH : LOW);
}

void buzzer(bool on) {
  if (!ENABLE_ACTUATORS || on == buzzerWasOn) return;
  buzzerWasOn = on;
  if (BUZZER_PASSIVE) {
    if (on) tone(PIN_BUZZER, BUZZER_FREQUENCY);
    else noTone(PIN_BUZZER);
  } else digitalWrite(PIN_BUZZER, on ? HIGH : LOW);
}

void initializeOutputs() {
  if (!ENABLE_ACTUATORS) return;
  // Fijar niveles inactivos antes de configurar las salidas.
  digitalWrite(PIN_RELAY, RELAY_ACTIVE_LOW ? HIGH : LOW);
  pinMode(PIN_RELAY, OUTPUT);
  const uint8_t pins[] = {PIN_RED, PIN_GREEN, PIN_BLUE};
  for (uint8_t pin : pins) {
    digitalWrite(pin, RGB_COMMON_ANODE ? HIGH : LOW);
    pinMode(pin, OUTPUT);
  }
  digitalWrite(PIN_BUZZER, LOW);
  pinMode(PIN_BUZZER, OUTPUT);
  pinMode(PIN_BUTTON, INPUT_PULLUP);
}

EnvironmentState classifyLocal(float gasValue, float tempValue, bool tempValid) {
  if (gasValue >= GAS_DANGER || (state == EnvironmentState::Danger && gasValue >= GAS_DANGER - 5)) return EnvironmentState::Danger;
  if (gasValue >= GAS_WARNING || (tempValid && tempValue >= TEMP_WARNING) ||
      (state == EnvironmentState::Warning && (gasValue >= GAS_WARNING - 5 || (tempValid && tempValue >= TEMP_WARNING - 1)))) return EnvironmentState::Warning;
  return EnvironmentState::Normal;
}

void applyState(EnvironmentState next) {
  if (next != state) {
    // El silencio solo vale durante el episodio de peligro actual.
    if (next == EnvironmentState::Danger || state == EnvironmentState::Danger) buzzerMuted = false;
    state = next;
    Serial.printf("[LOCAL] Estado: %s\n", state == EnvironmentState::Danger ? "PELIGRO" : state == EnvironmentState::Warning ? "ADVERTENCIA" : "NORMAL");
  }
  rgb(state != EnvironmentState::Normal, state != EnvironmentState::Danger, false);
  relay(state == EnvironmentState::Danger);
  buzzer(state == EnvironmentState::Danger && !buzzerMuted);
}

void silenceBuzzer() {
  if (state != EnvironmentState::Danger) return;
  buzzerMuted = true;
  buzzer(false);
  Serial.println("[LOCAL] Buzzer silenciado. LED rojo y rele siguen activos hasta salir de peligro.");
}

void handleControls(uint32_t now) {
  while (Serial.available()) {
    const char command = static_cast<char>(Serial.read());
    if (command == 's') silenceBuzzer();
    if (SIMULATION_MODE && (command == 'n' || command == 'a' || command == 'p')) {
      demoScenario = command;
      Serial.printf("[DEMO] Escenario %c seleccionado; se enviara en el proximo ciclo.\n", command);
    }
  }
  if (!ENABLE_ACTUATORS) return;
  static bool previous = HIGH;
  static bool stable = HIGH;
  static uint32_t changedAt = 0;
  const bool pressed = digitalRead(PIN_BUTTON);
  if (pressed != previous) { previous = pressed; changedAt = now; }
  if (now - changedAt >= 40 && pressed != stable) {
    stable = pressed;
    if (stable == LOW) silenceBuzzer();
  }
}

void readSensors(uint32_t now) {
  if (SIMULATION_MODE) {
    gas = demoScenario == 'p' ? 76 : demoScenario == 'a' ? 44 : 18;
    temperature = demoScenario == 'n' ? 25.4f : 31.2f;
    humidity = demoScenario == 'n' ? 61 : 70;
    light = demoScenario == 'p' ? 12 : 72;
    dhtSeen = true;
    lastDhtOk = now;
    return;
  }
  static uint32_t gasAt = 0;
  static uint32_t dhtAt = 0;
  static int gasBuffer[8];
  static int lightBuffer[8];
  static uint8_t index = 0;
  static uint8_t count = 0;
  if (now - gasAt >= GAS_SAMPLE_MS) {
    gasAt = now;
    gasBuffer[index] = analogRead(PIN_GAS);
    lightBuffer[index] = analogRead(PIN_LDR);
    index = (index + 1) % 8;
    if (count < 8) count++;
    long gasSum = 0, lightSum = 0;
    for (uint8_t i = 0; i < count; i++) { gasSum += gasBuffer[i]; lightSum += lightBuffer[i]; }
    gasRaw = gasSum / count;
    ldrRaw = lightSum / count;
    gas = scaleRelative(gasRaw, GAS_RAW_ZERO, GAS_RAW_SPAN);
    light = scaleRelative(ldrRaw, LDR_RAW_DARK, LDR_RAW_BRIGHT - LDR_RAW_DARK);
  }
  if (now - dhtAt >= DHT_SAMPLE_MS) {
    dhtAt = now;
    const float newTemperature = dht.readTemperature();
    const float newHumidity = dht.readHumidity();
    if (isfinite(newTemperature) && isfinite(newHumidity) && newTemperature >= -20 && newTemperature <= 80 && newHumidity >= 0 && newHumidity <= 100) {
      temperature = newTemperature;
      humidity = newHumidity;
      dhtSeen = true;
      lastDhtOk = now;
    } else {
      dhtSeen = false; // No publicar una medicion vieja o inventada.
      Serial.println("[SENSOR] Error DHT11: revisa alimentacion, DATA y resistencia pull-up.");
    }
  }
}

void networkTask(void*) {
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  uint32_t reconnectAt = millis() - 10000U;
  bool previouslyConnected = false;
  for (;;) {
    const uint32_t now = millis();
    const bool connected = WiFi.status() == WL_CONNECTED;
    if (!connected && now - reconnectAt >= 10000) {
      reconnectAt = now;
      Serial.println("[WIFI] Intentando conectar a la red configurada...");
      WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    }
    if (connected && !previouslyConnected) {
      Serial.print("[WIFI] Conectado. IP ESP32: ");
      Serial.println(WiFi.localIP());
    }
    if (!connected && previouslyConnected) Serial.println("[WIFI] Sin conexion. El control local continua.");
    previouslyConnected = connected;

    Reading reading;
    if (xQueueReceive(telemetryQueue, &reading, pdMS_TO_TICKS(200)) != pdTRUE) continue;
    if (!connected || millis() - reading.capturedAt > TELEMETRY_MAX_AGE_MS) continue;

    // DEVICE_ID se valida al arrancar: no requiere escapes JSON.
    char payload[320];
    snprintf(payload, sizeof(payload), "{\"deviceId\":\"%s%s\",\"gas\":%.1f,\"temperature\":%.1f,\"humidity\":%.1f,\"light\":%.1f}",
             DEVICE_ID, SIMULATION_MODE ? "-demo" : "", reading.gas, reading.temperature, reading.humidity, reading.light);
    WiFiClient client;
    HTTPClient http;
    http.setConnectTimeout(2500);
    // El API puede esperar hasta 8 s por Telegram.
    http.setTimeout(12000);
    if (!http.begin(client, API_URL)) { Serial.println("[HTTP] URL no valida."); continue; }
    http.addHeader("Content-Type", "application/json");
    http.addHeader("x-api-key", DEVICE_API_KEY);
    const int code = http.POST(reinterpret_cast<uint8_t*>(payload), strlen(payload));
    if (code == 201) Serial.println("[HTTP] 201: lectura guardada en el backend.");
    else if (code == 401) Serial.println("[HTTP] 401: DEVICE_API_KEY no coincide con backend/.env.");
    else if (code == 400) Serial.println("[HTTP] 400: revisa identificador y rangos de las lecturas.");
    else if (code == 503) Serial.println("[HTTP] 503: configura DEVICE_API_KEY en el backend.");
    else Serial.printf("[HTTP] Resultado %d: revisa IP del servidor, puerto, Wi-Fi y firewall.\n", code);
    // No reintentamos esta muestra: el servidor pudo guardarla antes del timeout.
    // Se enviara la lectura mas reciente; no se atribuye la hora actual a datos viejos.
    http.end();
  }
}

bool validConfiguration() {
  const size_t idLength = strlen(DEVICE_ID);
  if (idLength == 0 || idLength + (SIMULATION_MODE ? 5 : 0) > 64) return false;
  for (size_t i = 0; i < idLength; i++) {
    const char c = DEVICE_ID[i];
    if (!((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '-' || c == '_')) return false;
  }
  return strlen(WIFI_SSID) > 0 && strcmp(WIFI_SSID, "TU_RED_WIFI") != 0 &&
         strlen(DEVICE_API_KEY) > 0 && strcmp(DEVICE_API_KEY, "COPIA_DEVICE_API_KEY") != 0 &&
         strncmp(API_URL, "http://", 7) == 0;
}

void setup() {
  Serial.begin(115200);
  bootAt = millis();
  initializeOutputs();
  Serial.println("\nVIGIA GAS / ESP32");
  Serial.println(SIMULATION_MODE ? "MODO DEMO: valores simulados; pueden enviar alertas reales a Telegram." : "MODO SENSORES: calentamiento y calibracion requeridos.");
  Serial.println("Comandos: n normal, a advertencia, p peligro (solo demo); s silenciar buzzer.");
  if (!SIMULATION_MODE) {
    analogReadResolution(12);
    analogSetPinAttenuation(PIN_GAS, ADC_11db);
    analogSetPinAttenuation(PIN_LDR, ADC_11db);
    dht.begin();
  }
  if (!validConfiguration()) {
    Serial.println("[CONFIG] Completa secrets.h: Wi-Fi, API_URL HTTP local, DEVICE_API_KEY y DEVICE_ID.");
    return; // La lectura local continua; no iniciar red con credenciales de ejemplo.
  }
  telemetryQueue = xQueueCreate(1, sizeof(Reading));
  if (!telemetryQueue || xTaskCreate(networkTask, "vigia-network", 8192, nullptr, 1, nullptr) != pdPASS) {
    Serial.println("[ERROR] No se pudo iniciar la tarea de red; el control local continua.");
    if (telemetryQueue) { vQueueDelete(telemetryQueue); telemetryQueue = nullptr; }
  }
}

void loop() {
  const uint32_t now = millis();
  handleControls(now);
  readSensors(now);
  const bool warm = SIMULATION_MODE || now - bootAt >= MQ5_WARMUP_MS;
  const bool calibrated = SIMULATION_MODE || CALIBRATION_CONFIRMED;
  const bool dhtValid = dhtSeen && now - lastDhtOk <= DHT_STALE_MS;
  if (warm && calibrated) {
    const EnvironmentState next = classifyLocal(gas, temperature, dhtValid);
    applyState(next);
    // Un DHT11 fallido se muestra amarillo; el MQ-5 sigue pudiendo activar peligro.
    if (!dhtValid && state == EnvironmentState::Normal) rgb(true, true, false);
  } else {
    rgb((now / 500) % 2 == 0, (now / 500) % 2 == 0, false);
    relay(false);
    buzzer(false);
  }

  static uint32_t printAt = 0;
  if (now - printAt >= 2500) {
    printAt = now;
    Serial.printf("[%s] MQ5 raw=%d LDR raw=%d | gas=%.1f%% T=%.1fC H=%.1f%% luz=%.1f%%\n", SIMULATION_MODE ? "DEMO" : "SENSOR", gasRaw, ldrRaw, gas, temperature, humidity, light);
    if (!warm) Serial.printf("[MQ5] Esperando estabilizacion: %lu s restantes.\n", static_cast<unsigned long>((MQ5_WARMUP_MS - (now - bootAt)) / 1000));
    if (!calibrated) Serial.println("[CAL] Envio detenido. Ajusta referencias y CALIBRATION_CONFIRMED en settings.h.");
    if (!dhtValid) Serial.println("[DHT] Sin dato valido: no se envia telemetria incompleta.");
  }
  static uint32_t sentAt = 0;
  if (telemetryQueue && warm && calibrated && dhtValid && now - sentAt >= TELEMETRY_MS) {
    sentAt = now;
    const Reading reading = { gas, temperature, humidity, light, now };
    xQueueOverwrite(telemetryQueue, &reading);
  }
  delay(10);
}
