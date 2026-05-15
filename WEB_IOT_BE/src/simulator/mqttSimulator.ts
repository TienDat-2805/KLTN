import "dotenv/config";
import mqtt from "mqtt";

function parseCsv(value: string | undefined): string[] {
  if (!value) return [];

  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function num(value: string | undefined, fallback: number) {
  if (!value) return fallback;

  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function parseIntervalMs(raw: string | undefined, fallbackMs: number): number {
  if (!raw) return fallbackMs;

  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallbackMs;

  return n < 1000 ? Math.round(n * 1000) : Math.round(n);
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function randFloat(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function drift(value: number, min: number, max: number, step: number) {
  return clamp(value + randFloat(-step, step), min, max);
}

function topicForUid(uid: string) {
  return `iot/devices/${uid}/telemetry`;
}

function ackTopicForUid(uid: string) {
  return `iot/devices/${uid}/cmd/ack`;
}

function parseUidFromCmdTopic(topic: string): string | null {
  const parts = topic.split("/");

  if (parts.length < 4) return null;
  if (parts[0] !== "iot") return null;
  if (parts[1] !== "devices") return null;
  if (parts[3] !== "cmd") return null;

  return parts[2] || null;
}

type VirtualDeviceKind = "sensor" | "camera" | "light" | "ac";

type VirtualDeviceState = {
  uid: string;
  kind: VirtualDeviceKind;
  enabled: boolean;

  temperatureC?: number;
  humidityPct?: number;
  signalDbm: number;
  batteryPct?: number;

  lightOn?: boolean;

  acOn?: boolean;
  acTargetTempC?: number;
  roomTemperatureC?: number;

  frameCounter?: number;
};

function kindForUid(uid: string): VirtualDeviceKind {
  if (uid === "LIGHT_ETH_001") return "light";
  if (uid === "AC_ETH_001") return "ac";
  if (uid === "CAMERA_ETH_001") return "camera";

  return "sensor";
}

function createInitialState(uid: string): VirtualDeviceState {
  const kind = kindForUid(uid);

  if (kind === "light") {
    return {
      uid,
      kind,
      enabled: true,
      signalDbm: -62,
      batteryPct: 98,
      lightOn: false,
    };
  }

  if (kind === "ac") {
    return {
      uid,
      kind,
      enabled: true,
      signalDbm: -58,
      batteryPct: 100,
      acOn: false,
      acTargetTempC: 24,
      roomTemperatureC: 29,
    };
  }

  if (kind === "camera") {
    return {
      uid,
      kind,
      enabled: true,
      signalDbm: -52,
      frameCounter: 0,
    };
  }

  return {
    uid,
    kind,
    enabled: true,
    signalDbm: -60,
    batteryPct: 92,
    temperatureC: 28,
    humidityPct: 65,
  };
}

function buildCameraFrame(state: VirtualDeviceState, ts: string) {
  const count = state.frameCounter ?? 0;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360">
    <rect width="100%" height="100%" fill="#111827"/>
    <rect x="24" y="24" width="592" height="312" rx="18" fill="#1f2937" stroke="#334155"/>
    <text x="48" y="72" fill="#e5e7eb" font-family="Arial" font-size="28">Camera 01</text>
    <text x="48" y="108" fill="#9ca3af" font-family="Arial" font-size="16">${ts}</text>
    <text x="48" y="140" fill="#60a5fa" font-family="Arial" font-size="16">Frame #${count}</text>
    <circle cx="${120 + (count % 12) * 35}" cy="220" r="26" fill="#3b82f6"/>
    <text x="48" y="308" fill="#64748b" font-family="Arial" font-size="14">Virtual camera frame via MQTT</text>
  </svg>`;

  return Buffer.from(svg).toString("base64");
}

function updateStateBeforePublish(state: VirtualDeviceState) {
  state.signalDbm = drift(state.signalDbm, -90, -45, 2.5);

  if (state.kind === "sensor") {
    state.temperatureC = drift(state.temperatureC ?? 28, 20, 40, 1.2);
    state.humidityPct = drift(state.humidityPct ?? 65, 35, 90, 2.5);
    state.batteryPct = clamp((state.batteryPct ?? 92) - 0.01, 0, 100);
    return;
  }

  if (state.kind === "light") {
    const isOn = state.lightOn ?? false;
    state.batteryPct = clamp(
      (state.batteryPct ?? 98) - (isOn ? 0.08 : 0.005),
      0,
      100,
    );
    return;
  }

  if (state.kind === "ac") {
    const isOn = state.acOn ?? false;
    const target = state.acTargetTempC ?? 24;
    const current = state.roomTemperatureC ?? 29;

    if (isOn) {
      state.roomTemperatureC =
        current > target ? current - 0.25 : current + 0.05;
    } else {
      state.roomTemperatureC = current < 30 ? current + 0.08 : current;
    }

    state.roomTemperatureC = clamp(state.roomTemperatureC ?? 29, 16, 38);
    state.batteryPct = clamp(
      (state.batteryPct ?? 100) - (isOn ? 0.03 : 0.002),
      0,
      100,
    );
    return;
  }

  if (state.kind === "camera") {
    state.frameCounter = (state.frameCounter ?? 0) + 1;
  }
}

function buildPayload(state: VirtualDeviceState, ts: string) {
  updateStateBeforePublish(state);

  if (state.kind === "sensor") {
    return {
      ts,
      temperature: Number((state.temperatureC ?? 28).toFixed(1)),
      humidity: Number((state.humidityPct ?? 65).toFixed(1)),
      signalDbm: Number(state.signalDbm.toFixed(0)),
      batteryPct: Number((state.batteryPct ?? 92).toFixed(1)),
    };
  }

  if (state.kind === "light") {
    const lightOn = state.lightOn ?? false;

    return {
      ts,
      lightOn,
      signalDbm: Number(state.signalDbm.toFixed(0)),
      batteryPct: Number((state.batteryPct ?? 98).toFixed(1)),
      powerW: lightOn ? 9 : 0,
    };
  }

  if (state.kind === "ac") {
    const acOn = state.acOn ?? false;

    return {
      ts,
      acOn,
      acTargetTempC: state.acTargetTempC ?? 24,
      roomTemperatureC: Number((state.roomTemperatureC ?? 29).toFixed(1)),
      signalDbm: Number(state.signalDbm.toFixed(0)),
      batteryPct: Number((state.batteryPct ?? 100).toFixed(1)),
      powerW: acOn ? 1200 : 0,
    };
  }

  return {
    ts,
    signalDbm: Number(state.signalDbm.toFixed(0)),
    cameraFrame: buildCameraFrame(state, ts),
  };
}

function applyCommand(state: VirtualDeviceState, cmd: Record<string, unknown>) {
  const type = typeof cmd.type === "string" ? cmd.type : "";

  if (type === "device:set") {
    if (typeof cmd.enabled === "boolean") {
      state.enabled = cmd.enabled;
    }
  }

  if (state.kind === "light" && type === "light:set") {
    if (typeof cmd.on === "boolean") state.lightOn = cmd.on;
  }

  if (state.kind === "ac" && type === "ac:set") {
    if (typeof cmd.on === "boolean") state.acOn = cmd.on;

    if (
      typeof cmd.targetTempC === "number" &&
      Number.isFinite(cmd.targetTempC)
    ) {
      state.acTargetTempC = clampInt(cmd.targetTempC, 16, 30);
    }
  }

  return type;
}

function buildAckPayload(
  state: VirtualDeviceState,
  cmd: Record<string, unknown>,
  type: string,
) {
  const commandId =
    typeof cmd.commandId === "string" && cmd.commandId.trim()
      ? cmd.commandId.trim()
      : null;

  return {
    commandId,
    uid: state.uid,
    type: type || "unknown",
    ok: true,
    ts: new Date().toISOString(),
    state: commandLogPayload(state),
  };
}

function commandLogPayload(state: VirtualDeviceState) {
  if (state.kind === "light") {
    return {
      enabled: state.enabled,
      lightOn: state.lightOn ?? false,
      batteryPct: Number((state.batteryPct ?? 98).toFixed(1)),
      powerW: state.lightOn ? 9 : 0,
    };
  }

  if (state.kind === "ac") {
    return {
      enabled: state.enabled,
      acOn: state.acOn ?? false,
      acTargetTempC: state.acTargetTempC ?? 24,
      roomTemperatureC: Number((state.roomTemperatureC ?? 29).toFixed(1)),
      powerW: state.acOn ? 1200 : 0,
    };
  }

  return {
    enabled: state.enabled,
  };
}

async function main() {
  const MQTT_URL = process.env.MQTT_URL ?? "";
  const MQTT_USERNAME = process.env.MQTT_USERNAME ?? "";
  const MQTT_PASSWORD = process.env.MQTT_PASSWORD ?? "";

  const DEVICE_COUNT = Math.trunc(num(process.env.DEVICE_COUNT, 6));
  const INTERVAL_MS = parseIntervalMs(process.env.INTERVAL, 5000);
  const DEVICE_UID_RAW = (process.env.DEVICE_UID ?? "").trim();
  const DEVICE_UIDS = parseCsv(process.env.DEVICE_UIDS);
  const DEVICE_UID_LIST = parseCsv(DEVICE_UID_RAW);

  const SIM_DEVICE_UIDS = parseCsv(process.env.SIM_DEVICE_UIDS);
  const SIM_INTERVAL_MS = Math.max(
    250,
    Math.round(num(process.env.SIM_INTERVAL_MS, INTERVAL_MS)),
  );

  if (!MQTT_URL) {
    console.error("Missing MQTT_URL. Set MQTT_URL to enable simulator.");
    process.exit(1);
  }

  const effectiveIntervalMs = Math.max(
    250,
    Math.round(SIM_INTERVAL_MS || INTERVAL_MS),
  );

  const preferredUids = SIM_DEVICE_UIDS.length
    ? SIM_DEVICE_UIDS
    : DEVICE_UIDS.length
      ? DEVICE_UIDS
      : DEVICE_UID_LIST.length
        ? DEVICE_UID_LIST
        : [];

  const maxDefaultDevices = 6;
  const defaultUids = [
    "TEMP_ETH_001",
    "HUMIDITY_ETH_001",
    "LIGHT_ETH_001",
    "CAMERA_ETH_001",
    "AC_ETH_001",
    "POWER_ETH_001",
  ];

  const deviceCount = preferredUids.length
    ? clamp(preferredUids.length, 1, 50)
    : clamp(DEVICE_COUNT, 1, maxDefaultDevices);

  const uids = preferredUids.length
    ? preferredUids
    : defaultUids.slice(0, deviceCount);

  const stateByUid = new Map<string, VirtualDeviceState>();

  for (const uid of uids) {
    stateByUid.set(uid, createInitialState(uid));
  }

  const client = mqtt.connect(MQTT_URL, {
    username: MQTT_USERNAME || undefined,
    password: MQTT_PASSWORD || undefined,
    reconnectPeriod: 2000,
  });

  function publishOne(uid: string, reason = "interval") {
    const state = stateByUid.get(uid);
    if (!state) return false;

    if (!state.enabled) {
      if (reason === "command") {
        console.log(`Device disabled, no telemetry published: ${uid}`);
      }

      return false;
    }

    const ts = new Date().toISOString();
    const payload = buildPayload(state, ts);

    client.publish(topicForUid(uid), JSON.stringify(payload), { qos: 0 });

    if (reason === "command") {
      console.log(
        `Published command response: ${uid} ${JSON.stringify(payload)}`,
      );
    }

    return true;
  }

  client.on("connect", () => {
    console.log(`Simulator connected: ${MQTT_URL}`);
    console.log(
      `Managing ${uids.length} virtual device(s) every ${effectiveIntervalMs}ms`,
    );
    console.log(`UIDs: ${uids.join(", ")}`);

    console.log("Virtual device modes:");
    for (const uid of uids) {
      const state = stateByUid.get(uid);
      console.log(
        `- ${uid}: ${state?.kind ?? "unknown"} enabled=${state?.enabled ?? false}`,
      );
    }

    client.subscribe("iot/devices/+/cmd", (err) => {
      if (err) console.error("Simulator subscribe error:", err.message);
      else console.log("Simulator subscribed: iot/devices/+/cmd");
    });
  });

  client.on("reconnect", () => {
    console.log("Simulator reconnecting...");
  });

  client.on("offline", () => {
    console.log("Simulator offline");
  });

  client.on("close", () => {
    console.log("Simulator connection closed");
  });

  client.on("error", (err) => {
    console.error("Simulator MQTT error:", err.message);
  });

  client.on("message", (topic, payload) => {
    const uid = parseUidFromCmdTopic(topic);

    if (!uid) return;
    if (!uids.includes(uid)) return;

    let cmd: Record<string, unknown> | null = null;

    try {
      cmd = JSON.parse(payload.toString("utf8")) as Record<string, unknown>;
    } catch {
      console.warn(`Simulator: invalid JSON command for ${uid}`);
      return;
    }

    const state = stateByUid.get(uid);
    if (!state) return;

    const type = applyCommand(state, cmd);
    const ack = buildAckPayload(state, cmd, type);

    console.log(
      `Simulator cmd for ${uid} (${type || "unknown"}): ${JSON.stringify(commandLogPayload(state))}`,
    );

    if (ack.commandId) {
      client.publish(ackTopicForUid(uid), JSON.stringify(ack), { qos: 0 });
      console.log(`Published command ack: ${uid} ${ack.commandId}`);
    }

    publishOne(uid, "command");
  });

  const timer = setInterval(() => {
    let published = 0;

    for (const uid of uids) {
      if (publishOne(uid)) published++;
    }

    console.log(
      `Published virtual telemetry: ${published} device(s) @ ${new Date().toISOString()}`,
    );
  }, effectiveIntervalMs);

  function shutdown(signal: string) {
    console.log(`${signal} received, shutting down simulator...`);
    clearInterval(timer);
    client.end(false, {}, () => process.exit(0));
  }

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
