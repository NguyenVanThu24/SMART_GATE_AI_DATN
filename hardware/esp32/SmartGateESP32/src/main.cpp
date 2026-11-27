#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <ESP32Servo.h>
#include <ArduinoJson.h>
#include "config.h"

WiFiClient net;
PubSubClient mqtt(net);
Servo barrier;
const char* commandTopic = "smartgate/gates/1/command";
const char* statusTopic = "smartgate/gates/1/status";
const char* availabilityTopic = "smartgate/gates/1/availability";
String status = "unknown", lastId;
unsigned long lastWifi = 0, lastMqtt = 0;

void report(const String& id) {
    JsonDocument doc;
    doc["gate_id"] = GATE_ID;
    doc["command_id"] = id;
    doc["status"] = status;
    doc["position_verified"] = false;
    String out;
    serializeJson(doc, out);
    bool ok = mqtt.publish(statusTopic, out.c_str(), false);
    Serial.printf("[MQTT] STATUS %s: %s\n", ok ? "SENT" : "FAILED", out.c_str());
}
void receive(char* topic, byte* payload, unsigned int length) {
    if (strcmp(topic, commandTopic)) return;
    JsonDocument doc;
    if (deserializeJson(doc, payload, length)) return;
    String id = doc["command_id"] | "";
    String action = doc["action"] | "";
    if ((doc["gate_id"] | 0) != GATE_ID || !id.length() || id.length() > 64) return;
    if (action != "open" && action != "close") return;
    if (id == lastId) { report(id); return; }
    if (!barrier.attached()) {
        barrier.setPeriodHertz(50);
        barrier.attach(SERVO_PIN, 1000, 2000);
    }
    if (!barrier.attached()) { status = "error"; report(id); return; }
    barrier.write(action == "open" ? OPEN_ANGLE : CLOSE_ANGLE);
    digitalWrite(LED_PIN, action == "open" ? HIGH : LOW);
    status = action == "open" ? "open" : "closed";
    lastId = id;
    Serial.printf("[BARRIER] %s COMMAND\n", action.c_str());
    report(id);
}
void setup() {
    Serial.begin(115200);
    pinMode(LED_PIN, OUTPUT);
    digitalWrite(LED_PIN, LOW);
    Serial.println("SMART GATE AI - MQTT HARDWARE TEST");
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    Serial.println("[WIFI] CONNECTING...");
    mqtt.setServer(MQTT_HOST, MQTT_PORT);
    mqtt.setCallback(receive);
    mqtt.setBufferSize(1024);
    mqtt.setKeepAlive(15);
    mqtt.setSocketTimeout(3);
}
void loop() {
    unsigned long now = millis();
    static bool wifiReported = false;
    if (WiFi.status() != WL_CONNECTED) {
        wifiReported = false;
        if (now - lastWifi >= 10000) {
            lastWifi = now;
            WiFi.reconnect();
            Serial.println("[WIFI] RETRY");
        }
    } else {
        if (!wifiReported) {
            wifiReported = true;
            Serial.println("[WIFI] CONNECTED");
            Serial.println(WiFi.localIP());
        }
        if (!mqtt.connected()) {
            if (now - lastMqtt >= 5000) {
                lastMqtt = now;
                Serial.println("[MQTT] CONNECTING...");
                if (mqtt.connect(MQTT_CLIENT_ID, MQTT_USER, MQTT_PASSWORD, availabilityTopic, 1, true, "offline", true)) {
                    if (!mqtt.subscribe(commandTopic, 1)) { mqtt.disconnect(); return; }
                    mqtt.publish(availabilityTopic, "online", true);
                    Serial.println("[MQTT] CONNECTED");
                    Serial.println("[MQTT] SUBSCRIBED: smartgate/gates/1/command");
                    report("");
                } else Serial.printf("[MQTT] ERROR: %d\n", mqtt.state());
            }
        } else mqtt.loop();
    }
    delay(10);
}
