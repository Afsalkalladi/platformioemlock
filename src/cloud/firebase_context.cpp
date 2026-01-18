#include "firebase_context.h"
#include <Arduino.h>

FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;

void tokenStatusCallback(TokenInfo info) {
    Serial.printf(
        "[FIREBASE] Token status: %s\n",
        info.status == token_status_ready ? "READY" : "PROCESSING"
    );
}
