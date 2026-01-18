#pragma once

class BuzzerManager {
public:
    static void init();

    static void playGrantTone();
    static void playDenyTone();
    static void playPendingTone();
    static void playExitTone();
    static void playRemoteTone();
    static void playInvalid();
};
