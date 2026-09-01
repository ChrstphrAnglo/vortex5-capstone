// BewAir ESP32 node
// Reads FS00905B air quality sensor over UART2, publishes raw frames over MQTT/TLS.
// First-boot Wi-Fi provisioning via SoftAP.

#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <WebServer.h>
#include <Preferences.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

#include "secrets.h"

// ---------- pins ----------
static const int SENSOR_RX = 16;  // ESP32 RX2 <- sensor TXD (pin 9)
static const int SENSOR_TX = 17;  // ESP32 TX2 -> sensor RXD (pin 7), unused (sensor auto-uploads)
static const int RESET_BTN = 0;   // GPIO0 = BOOT button on most ESP32 dev boards

// ---------- mqtt ----------
static const char* MQTT_HOST = "1c097cff873e428286ffc57255b3a044.s1.eu.hivemq.cloud";
static const uint16_t MQTT_PORT = 8883;

// ---------- runtime ----------
Preferences      prefs;
WebServer        httpServer(80);
WiFiClientSecure tls;
PubSubClient     mqtt(tls);

String deviceId;     // "BewAir-XXXX"
String mqttTopic;    // "bewair/<deviceId>/telemetry"

enum Mode { MODE_PROVISIONING, MODE_RUNNING };
Mode mode;

// Soft power state. When false, the node stays connected to MQTT (so it can
// still receive the "on" command) but stops publishing telemetry. Persisted
// in NVS so the off/on choice survives reboots.
bool publishingEnabled = true;

// frame parser
static uint8_t  frameBuf[80];
static size_t   frameIdx = 0;
static size_t   expectedTotal = 0;
static bool     readingFrame = false;

static unsigned long lastReconnectAttempt = 0;

// ---------- helpers ----------
String macSuffix() {
  // Read from eFuse directly — works before WiFi is initialized.
  uint64_t chipId = ESP.getEfuseMac();
  char buf[5];
  snprintf(buf, sizeof(buf), "%04X", (uint16_t)(chipId >> 32));
  return String(buf);
}

// ---------- http handlers (run in both modes) ----------
void handleInfo() {
  StaticJsonDocument<160> doc;
  doc["deviceId"] = deviceId;
  doc["status"]   = (mode == MODE_PROVISIONING) ? "awaiting-credentials" : "online";
  if (mode == MODE_RUNNING && WiFi.isConnected()) {
    doc["ip"] = WiFi.localIP().toString();
  }
  String out;
  serializeJson(doc, out);
  httpServer.sendHeader("Access-Control-Allow-Origin", "*");
  httpServer.send(200, "application/json", out);
}

void handleReset() {
  httpServer.sendHeader("Access-Control-Allow-Origin", "*");
  Serial.println("[reset] wiping credentials and rebooting");
  prefs.remove("wifi_ssid");
  prefs.remove("wifi_pass");
  httpServer.send(200, "application/json", "{\"ok\":true}");
  delay(1000);
  ESP.restart();
}

void handleProvision() {
  httpServer.sendHeader("Access-Control-Allow-Origin", "*");
  if (!httpServer.hasArg("plain")) {
    httpServer.send(400, "application/json", "{\"ok\":false,\"error\":\"missing body\"}");
    return;
  }
  StaticJsonDocument<256> doc;
  if (deserializeJson(doc, httpServer.arg("plain"))) {
    httpServer.send(400, "application/json", "{\"ok\":false,\"error\":\"bad json\"}");
    return;
  }
  String ssid = doc["ssid"] | "";
  String pass = doc["password"] | "";
  if (ssid.length() == 0) {
    httpServer.send(400, "application/json", "{\"ok\":false,\"error\":\"empty ssid\"}");
    return;
  }
  prefs.putString("wifi_ssid", ssid);
  prefs.putString("wifi_pass", pass);
  Serial.println("[provision] credentials saved, rebooting...");
  httpServer.send(200, "application/json", "{\"ok\":true}");
  delay(1500);
  ESP.restart();
}

void handleOptions() {
  httpServer.sendHeader("Access-Control-Allow-Origin", "*");
  httpServer.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  httpServer.sendHeader("Access-Control-Allow-Headers", "Content-Type");
  httpServer.send(204);
}

void registerHttpRoutes() {
  httpServer.on("/info",      HTTP_GET,     handleInfo);
  httpServer.on("/provision", HTTP_POST,    handleProvision);
  httpServer.on("/reset",     HTTP_POST,    handleReset);
  httpServer.on("/info",      HTTP_OPTIONS, handleOptions);
  httpServer.on("/provision", HTTP_OPTIONS, handleOptions);
  httpServer.on("/reset",     HTTP_OPTIONS, handleOptions);
}

void startProvisioningMode() {
  mode = MODE_PROVISIONING;
  WiFi.mode(WIFI_AP);
  delay(100);  // let mode change settle before softAP()
  bool apOk = WiFi.softAP(deviceId.c_str());
  if (!apOk) {
    Serial.println("[provisioning] softAP() failed, restarting in 3s");
    delay(3000);
    ESP.restart();
  }
  IPAddress ip = WiFi.softAPIP();
  Serial.printf("[provisioning] AP=%s IP=%s\n", deviceId.c_str(), ip.toString().c_str());
  httpServer.begin();
}

// ---------- station / mqtt ----------
bool connectWifi(const String& ssid, const String& pass) {
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid.c_str(), pass.c_str());
  Serial.printf("[wifi] connecting to %s", ssid.c_str());
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED) {
    if (millis() - start > 30000) { Serial.println(" failed"); return false; }
    checkResetButton();  // stay responsive to a held BOOT button while we wait
    delay(500);
    Serial.print(".");
  }
  Serial.printf(" ok IP=%s\n", WiFi.localIP().toString().c_str());
  return true;
}

void onMqttMessage(char* topic, byte* payload, unsigned int length) {
  String cmd;
  cmd.reserve(length);
  for (unsigned int i = 0; i < length; i++) cmd += (char)payload[i];
  Serial.printf("[mqtt] cmd received on %s: %s\n", topic, cmd.c_str());

  if (cmd == "reset") {
    Serial.println("[mqtt] reset cmd — wiping creds and rebooting");
    prefs.remove("wifi_ssid");
    prefs.remove("wifi_pass");
    delay(500);
    ESP.restart();
  } else if (cmd == "off") {
    Serial.println("[mqtt] off cmd — pausing telemetry");
    publishingEnabled = false;
    prefs.putBool("enabled", false);
  } else if (cmd == "on") {
    Serial.println("[mqtt] on cmd — resuming telemetry");
    publishingEnabled = true;
    prefs.putBool("enabled", true);
  }
}

bool connectMqtt() {
  Serial.printf("[mqtt] connecting as %s ... ", deviceId.c_str());
  bool ok = mqtt.connect(deviceId.c_str(), MQTT_USERNAME, MQTT_PASSWORD);
  Serial.println(ok ? "ok" : String("fail rc=") + mqtt.state());
  if (ok) {
    String cmdTopic = "bewair/" + deviceId + "/cmd";
    mqtt.subscribe(cmdTopic.c_str(), 1);
    Serial.printf("[mqtt] subscribed to %s\n", cmdTopic.c_str());
  }
  return ok;
}

void startStationMode(const String& ssid, const String& pass) {
  mode = MODE_RUNNING;
  // A single failed connection attempt doesn't mean the saved credentials
  // are wrong — most commonly it means the router itself hasn't finished
  // booting yet (very likely right after this device was powered back on
  // after being off a while: the ESP32 comes up in seconds, home routers
  // often take much longer). Keep retrying instead of wiping the stored
  // Wi-Fi credentials and dropping into provisioning mode on our own —
  // that should only ever happen from an explicit user action (BOOT button
  // held 3s, the /reset endpoint, or an MQTT "reset" command).
  while (!connectWifi(ssid, pass)) {
    Serial.println("[wifi] retrying in 5s...");
    for (int i = 0; i < 10; i++) {   // 10 x 500ms, checked in small steps
      checkResetButton();            // still escapable via a held BOOT button
      delay(500);
    }
  }
  tls.setInsecure();  // capstone simplification — production should pin the HiveMQ CA
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setKeepAlive(60);
  mqtt.setBufferSize(512);
  mqtt.setCallback(onMqttMessage);
  httpServer.begin();
  Serial.printf("[http] reset endpoint: POST http://%s/reset\n",
                WiFi.localIP().toString().c_str());
}

// ---------- sensor parser ----------
bool checksumValid(const uint8_t* buf, size_t total) {
  if (total < 4) return false;
  uint16_t sum = 0;
  for (size_t i = 0; i < total - 2; i++) sum += buf[i];
  uint16_t got = (uint16_t(buf[total - 2]) << 8) | buf[total - 1];
  return sum == got;
}

void publishFrame(const uint8_t* buf, size_t total) {
  if (!publishingEnabled) return;   // soft "off" — skip telemetry, stay connected
  static char payload[200];
  for (size_t i = 0; i < total; i++) snprintf(payload + i * 2, 3, "%02X", buf[i]);
  payload[total * 2] = 0;
  bool ok = mqtt.publish(mqttTopic.c_str(), payload);
  Serial.printf("[mqtt] publish %s (%u bytes)\n", ok ? "ok" : "FAIL", (unsigned)total);
}

void readSensor() {
  while (Serial2.available()) {
    uint8_t b = Serial2.read();

    if (!readingFrame) {
      if (b == 0x42) {
        frameBuf[0] = b;
        frameIdx = 1;
        readingFrame = true;
      }
      continue;
    }

    if (frameIdx == 1) {
      if (b == 0x4D) {
        frameBuf[frameIdx++] = b;
      } else {
        readingFrame = false;
        frameIdx = 0;
        if (b == 0x42) { frameBuf[0] = b; frameIdx = 1; readingFrame = true; }
      }
      continue;
    }

    if (frameIdx >= sizeof(frameBuf)) {
      readingFrame = false;
      frameIdx = 0;
      continue;
    }

    frameBuf[frameIdx++] = b;

    if (frameIdx == 4) {
      uint16_t lengthVal = (uint16_t(frameBuf[2]) << 8) | frameBuf[3];
      expectedTotal = 4 + lengthVal;
      if (expectedTotal > sizeof(frameBuf) || expectedTotal < 6) {
        readingFrame = false;
        frameIdx = 0;
      }
      continue;
    }

    if (frameIdx >= 4 && frameIdx == expectedTotal) {
      if (checksumValid(frameBuf, expectedTotal)) {
        publishFrame(frameBuf, expectedTotal);
      } else {
        Serial.println("[sensor] checksum failed, dropping frame");
      }
      readingFrame = false;
      frameIdx = 0;
    }
  }
}
// Hold the BOOT button for 3 seconds during normal operation to wipe Wi-Fi.
void checkResetButton() {
  if (digitalRead(RESET_BTN) != LOW) return;
  unsigned long heldStart = millis();
  while (digitalRead(RESET_BTN) == LOW) {
    if (millis() - heldStart >= 3000) {
      Serial.println("[reset] BOOT held 3s — wiping Wi-Fi creds");
      prefs.remove("wifi_ssid");
      prefs.remove("wifi_pass");
      delay(500);
      ESP.restart();
    }
    delay(50);
  }
}

// ---------- main ----------
void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println("\n[boot] BewAir node");

  pinMode(RESET_BTN, INPUT_PULLUP);

  Serial2.begin(9600, SERIAL_8N1, SENSOR_RX, SENSOR_TX);
  prefs.begin("bewair", false);
  publishingEnabled = prefs.getBool("enabled", true);   // default on

  deviceId  = "BewAir-" + macSuffix();
  mqttTopic = "bewair/" + deviceId + "/telemetry";
  Serial.printf("[boot] deviceId=%s topic=%s\n", deviceId.c_str(), mqttTopic.c_str());

  registerHttpRoutes();

  String storedSsid = prefs.getString("wifi_ssid", "");
  if (storedSsid.length() == 0) {
    startProvisioningMode();
  } else {
    startStationMode(storedSsid, prefs.getString("wifi_pass", ""));
  }
}

void loop() {
  checkResetButton();           // hold BOOT 3s to factory reset
  httpServer.handleClient();    // /info, /provision, /reset always reachable

  if (mode == MODE_PROVISIONING) return;

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[wifi] dropped, restarting");
    delay(1000);
    ESP.restart();
  }

  if (!mqtt.connected()) {
    if (millis() - lastReconnectAttempt > 5000) {
      lastReconnectAttempt = millis();
      connectMqtt();
    }
    return;
  }

  mqtt.loop();
  readSensor();
}
