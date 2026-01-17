#pragma once
#include <stdint.h>

class RelayController {
public:
    static void init();
    static void unlock();
    static void lock();

private:
    static void setRelay(bool unlock);
};
