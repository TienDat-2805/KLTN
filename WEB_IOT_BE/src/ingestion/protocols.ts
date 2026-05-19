export type ProtocolAdapterInfo = {
  key: string;
  label: string;
  connectionType: "WIRED" | "LPWAN";
  identifier: "deviceUid" | "devEui";
  uplinkTopic: string;
  downlinkTopic: string;
  telemetryFields: string[];
  runtimeFields: string[];
  reliabilityFeatures: string[];
  backendModules: string[];
};

export const protocolAdapters: ProtocolAdapterInfo[] = [
  {
    key: "wired-mqtt",
    label: "Wired MQTT telemetry adapter",
    connectionType: "WIRED",
    identifier: "deviceUid",
    uplinkTopic: "iot/devices/<device_uid>/telemetry",
    downlinkTopic: "iot/devices/<device_uid>/cmd",
    telemetryFields: ["temperatureC", "humidityPct", "signalDbm"],
    runtimeFields: ["lightOn", "acOn", "acTargetTempC", "cameraFrame"],
    reliabilityFeatures: ["commandId", "ACK", "TIMEOUT"],
    backendModules: [
      "src/mqtt/client.ts",
      "src/telemetry/service.ts",
      "src/commands/service.ts",
    ],
  },
  {
    key: "lpwan-lorawan-like",
    label: "LPWAN LoRaWAN-like uplink adapter",
    connectionType: "LPWAN",
    identifier: "devEui",
    uplinkTopic: "lpwan/uplink/<devEui>",
    downlinkTopic: "lpwan/downlink/<devEui>",
    telemetryFields: [
      "temperatureC",
      "humidityPct",
      "batteryPct",
      "rssi",
      "snr",
      "spreadingFactor",
      "fCnt",
    ],
    runtimeFields: ["enabled"],
    reliabilityFeatures: [
      "uplink counter validation",
      "duplicate uplink detection",
      "replay uplink detection",
      "LPWAN health score",
    ],
    backendModules: [
      "src/mqtt/client.ts",
      "src/lpwan/uplink.ts",
      "src/lpwan/health.ts",
      "src/alerts/service.ts",
    ],
  },
];
