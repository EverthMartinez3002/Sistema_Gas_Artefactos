#pragma once
#include <Arduino.h>

enum class EnvironmentState : uint8_t { Normal, Warning, Danger };
struct Reading {
  float gas;
  float temperature;
  float humidity;
  float light;
  uint32_t capturedAt;
};
