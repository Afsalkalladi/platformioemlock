#pragma once
#include <Firebase_ESP_Client.h>

extern FirebaseData fbdo;
extern FirebaseAuth auth;
extern FirebaseConfig config;

void tokenStatusCallback(TokenInfo info);
