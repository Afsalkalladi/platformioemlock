#pragma once

// ==================== FIRMWARE INFO ====================
#define FW_VERSION "1.0.0"

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
