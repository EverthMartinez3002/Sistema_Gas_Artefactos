#pragma once
#include <Arduino.h>

// true: sin sensores, datos elegidos por Monitor Serie. false: sensores reales.
constexpr bool SIMULATION_MODE = true;
// Habilitar solo despues de montar/verificar las salidas de bajo voltaje.
constexpr bool ENABLE_ACTUATORS = false;
constexpr bool RGB_COMMON_ANODE = true;
constexpr bool RELAY_ACTIVE_LOW = true;
constexpr bool BUZZER_PASSIVE = true; // false si el buzzer suena con DC constante.
constexpr unsigned BUZZER_FREQUENCY = 4000;

// Pines para ESP32 clasico / WROOM-32 (ESP32 Dev Module), NO C3/S3.
constexpr uint8_t PIN_GAS = 34;       // ADC1
constexpr uint8_t PIN_LDR = 35;       // ADC1
constexpr uint8_t PIN_DHT = 27;
constexpr uint8_t PIN_RED = 25;
constexpr uint8_t PIN_GREEN = 26;
constexpr uint8_t PIN_BLUE = 33;
constexpr uint8_t PIN_BUZZER = 32;    // Mediante transistor NPN
constexpr uint8_t PIN_RELAY = 23;     // Entrada compatible con logica de 3.3 V
constexpr uint8_t PIN_BUTTON = 18;    // Pulsador hacia GND; INPUT_PULLUP

// Valores ilustrativos: se deben ajustar con las mediciones de tu montaje.
// El envio real se bloquea hasta cambiar CALIBRATION_CONFIRMED a true.
constexpr bool CALIBRATION_CONFIRMED = false;
constexpr int GAS_RAW_ZERO = 800;    // Lectura estable en aire limpio
constexpr int GAS_RAW_SPAN = 2200;   // Incremento ADC que representa 100% relativo
constexpr int LDR_RAW_DARK = 200;    // Lectura con luces apagadas
constexpr int LDR_RAW_BRIGHT = 3500; // Lectura con luces encendidas

// Espera de demostracion por arranque, NO sustituye acondicionar el MQ-5.
// El manual Winsen especifica >=48 h de precalentamiento en sus condiciones
// de ensayo. Ajusta este tiempo segun la estabilizacion real del modulo.
constexpr uint32_t MQ5_WARMUP_MS = 180000;

// Mantener iguales a GAS_WARNING, GAS_DANGER y TEMP_WARNING del backend.
constexpr float GAS_WARNING = 35;
constexpr float GAS_DANGER = 60;
constexpr float TEMP_WARNING = 30;
constexpr uint32_t GAS_SAMPLE_MS = 250;
constexpr uint32_t DHT_SAMPLE_MS = 2500;
constexpr uint32_t TELEMETRY_MS = 5000;
constexpr uint32_t DHT_STALE_MS = 10000;
constexpr uint32_t TELEMETRY_MAX_AGE_MS = 10000;
