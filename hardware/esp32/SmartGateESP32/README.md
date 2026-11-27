# Smart Gate AI - ESP32

## Hardware

- ESP32 DevKit
- SG90 servo
- Servo signal: GPIO18
- Built-in LED: GPIO2

## Development

- Visual Studio Code
- PlatformIO
- Arduino Framework

## Configuration

Copy include/config.example.h to include/config.h.

Configure Wi-Fi and MQTT credentials locally.
Never commit include/config.h.

## MQTT topics

- smartgate/gates/1/command
- smartgate/gates/1/status
- smartgate/gates/1/availability

## Current implementation

- Wi-Fi connection and reconnection
- MQTT authentication
- Manual open and close commands
- Command ID acknowledgement
- Online and offline availability

## Limitations

- Prototype only
- No physical position feedback
- No obstacle detection
- No automatic closing
- HC-SR04 integration pending
