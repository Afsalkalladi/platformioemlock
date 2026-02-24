#pragma once

// ==================== FIRMWARE INFO ====================
#define FW_VERSION "1.0.0"

// ==================== PIN CONFIGURATION ====================
#define BUZZER_PIN                 32
#define EXIT_SENSOR_PIN            35

// RFID PN532 (SPI) — same pins formerly used by RC522
#define PN532_SCK_PIN              18
#define PN532_MISO_PIN             19
#define PN532_MOSI_PIN             23
#define PN532_SS_PIN               21
#define PN532_RST_PIN              22

// ==================== HEALTH REPORTING ====================
#define HEALTH_PRINT_INTERVAL_MS   5000   // Print health every 5s

// Heap warning levels (bytes)
#define HEAP_WARN_LEVEL            40000
#define HEAP_CRIT_LEVEL            20000

// ==================== LOGGING ====================
#define LOG_RETENTION_DAYS_LOCAL   30
#define LOG_RETENTION_DAYS_CLOUD   90

// ==================== SYSTEM LIMITS ====================
#define MAX_USERS                  10     // Can change later

// ==================== DEBUG ====================
#define DEBUG_SERIAL               1
