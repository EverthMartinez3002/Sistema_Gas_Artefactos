#pragma once

// Copia este archivo como secrets.h en la MISMA carpeta del .ino.
// Usa una red Wi-Fi de 2.4 GHz y la IPv4 de la computadora (ipconfig).
constexpr char WIFI_SSID[] = "TU_RED_WIFI";
constexpr char WIFI_PASSWORD[] = "TU_PASSWORD_WIFI";
constexpr char API_URL[] = "http://192.168.1.100:3001/api/readings";
// Copia DEVICE_API_KEY de backend/.env. No uses ADMIN_API_KEY ni el token del bot.
constexpr char DEVICE_API_KEY[] = "COPIA_DEVICE_API_KEY";

// Solo letras, numeros, guion y guion bajo; maximo 64 caracteres.
// En simulacion se envia DEVICE_ID seguido de -demo.
constexpr char DEVICE_ID[] = "esp32-01";
