import "dotenv/config";
import mqtt from "mqtt";

const MQTT_URL = process.env.MQTT_URL || "mqtt://localhost:1883";

const DEV_EUIS = (
  process.env.LPWAN_DEV_EUIS ||
  process.env.LPWAN_DEV_EUI ||
  "70B3D57ED005A001"
)
  .split(",")
  .map((s) => s.trim().toUpperCase())
  .filter(Boolean);

const DEFAULT_GATEWAY_ID = process.env.LPWAN_GATEWAY_ID || "GW-HANOI-01";
const INTERVAL_MS = Number(process.env.LPWAN_INTERVAL_MS || 5000);
const DEMO_ALERTS = process.env.LPWAN_DEMO_ALERTS === "true";
const DEMO_COUNTER_ANOMALIES =
  process.env.LPWAN_DEMO_COUNTER_ANOMALIES === "true";
const ALERT_RATE = Math.max(
  0,
  Math.min(1, Number(process.env.LPWAN_ALERT_RATE || 0.08)),
);
const COUNTER_ANOMALY_RATE = Math.max(
  0,
  Math.min(1, Number(process.env.LPWAN_COUNTER_ANOMALY_RATE || 0.03)),
);

type LpwanDeviceState = {
  devEui: string;
  gatewayId: string;
  fCnt: number;
  enabled: boolean;
  batteryPct: number;
  temperatureC: number;
  humidityPct: number;
};

function randomBetween(min: number, max: number, digits = 1) {
  const value = min + Math.random() * (max - min);
  return Number(value.toFixed(digits));
}

function randomInt(min: number, max: number) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseDownlinkDevEui(topic: string) {
  const parts = topic.split("/");

  if (parts.length < 3) return null;
  if (parts[0] !== "lpwan") return null;
  if (parts[1] !== "downlink") return null;

  return parts[2]?.trim().toUpperCase() || null;
}

function gatewayForIndex(index: number) {
  if (index <= 1) return DEFAULT_GATEWAY_ID;
  return "GW-HANOI-02";
}

function createState(devEui: string, index: number): LpwanDeviceState {
  return {
    devEui,
    gatewayId: gatewayForIndex(index),
    fCnt: 0,
    enabled: true,
    batteryPct: randomBetween(85, 100, 1),
    temperatureC: randomBetween(25, 31, 1),
    humidityPct: randomBetween(55, 75, 1),
  };
}

function updateSensorState(state: LpwanDeviceState) {
  state.fCnt += 1;

  state.temperatureC = randomBetween(
    Math.max(22, state.temperatureC - 1.2),
    Math.min(33, state.temperatureC + 1.2),
    1,
  );

  state.humidityPct = randomBetween(
    Math.max(35, state.humidityPct - 3),
    Math.min(90, state.humidityPct + 3),
    1,
  );

  state.batteryPct = Math.max(
    60,
    Number((state.batteryPct - 0.01).toFixed(1)),
  );
}

async function main() {
  if (DEV_EUIS.length === 0) {
    console.error("No LPWAN DevEUI configured");
    process.exit(1);
  }

  console.log(`LoRaWAN-like simulator connecting to ${MQTT_URL}`);
  console.log(`DevEUIs: ${DEV_EUIS.join(", ")}`);
  console.log(`Default gateway: ${DEFAULT_GATEWAY_ID}`);
  console.log(
    `Demo alerts: ${DEMO_ALERTS ? `enabled, rate=${ALERT_RATE}` : "disabled"}`,
  );
  console.log(
    `Counter anomaly demo: ${
      DEMO_COUNTER_ANOMALIES
        ? `enabled, rate=${COUNTER_ANOMALY_RATE}`
        : "disabled"
    }`,
  );

  const client = mqtt.connect(MQTT_URL, {
    reconnectPeriod: 2000,
  });

  const states = new Map<string, LpwanDeviceState>();

  DEV_EUIS.forEach((devEui, index) => {
    states.set(devEui, createState(devEui, index));
  });

  client.on("connect", async () => {
    console.log("LoRaWAN-like simulator connected");

    for (const devEui of DEV_EUIS) {
      const downlinkTopic = `lpwan/downlink/${devEui}`;

      client.subscribe(downlinkTopic, (err) => {
        if (err) {
          console.error("LPWAN downlink subscribe error:", err.message);
          return;
        }

        console.log(`LPWAN simulator subscribed: ${downlinkTopic}`);
      });
    }

    while (true) {
      const delay = randomInt(1000, 3000);
      await sleep(delay);

      let published = 0;

      for (const state of states.values()) {
        if (!state.enabled) {
          console.log(
            `LPWAN disabled: no uplink sent for ${state.devEui}. Waiting for downlink enable...`,
          );
          continue;
        }

        updateSensorState(state);

        const demoWeakSignal = DEMO_ALERTS && Math.random() < ALERT_RATE;
        const demoLowBattery =
          DEMO_ALERTS && !demoWeakSignal && Math.random() < ALERT_RATE / 3;
        const demoHighTemperature =
          DEMO_ALERTS &&
          !demoWeakSignal &&
          !demoLowBattery &&
          Math.random() < ALERT_RATE / 4;
        const demoCounterAnomaly =
          DEMO_COUNTER_ANOMALIES &&
          state.fCnt > 3 &&
          Math.random() < COUNTER_ANOMALY_RATE;

        const reportedTemperatureC = demoHighTemperature
          ? randomBetween(35.5, 38, 1)
          : state.temperatureC;

        const reportedBatteryPct = demoLowBattery
          ? randomBetween(12, 19, 1)
          : state.batteryPct;

        const rssi = demoWeakSignal
          ? randomInt(-125, -116)
          : randomInt(-108, -82);

        const snr = demoWeakSignal
          ? randomBetween(-9, -5.5, 1)
          : randomBetween(-1, 12, 1);

        const spreadingFactor = demoWeakSignal
          ? randomInt(10, 12)
          : randomInt(7, 10);

        const uplinkCounter = demoCounterAnomaly
          ? state.fCnt - randomInt(1, 3)
          : state.fCnt;

        const uplinkTopic = `lpwan/uplink/${state.devEui}`;

        const payload = {
          devEui: state.devEui,
          gatewayId: state.gatewayId,
          networkType: "LORAWAN",
          rssi,
          snr,
          spreadingFactor,
          fCnt: uplinkCounter,
          ts: new Date().toISOString(),
          payload: {
            temperatureC: reportedTemperatureC,
            humidityPct: state.humidityPct,
            batteryPct: reportedBatteryPct,
          },
        };

        client.publish(
          uplinkTopic,
          JSON.stringify(payload),
          { qos: 0 },
          (err) => {
            if (err) {
              console.error("Publish error:", err.message);
              return;
            }

            console.log(
              `LPWAN uplink #${uplinkCounter} -> ${uplinkTopic} | enabled=${state.enabled} temp=${reportedTemperatureC}C hum=${state.humidityPct}% rssi=${rssi}dBm snr=${snr} SF${spreadingFactor} battery=${reportedBatteryPct}%${demoCounterAnomaly ? " counter-anomaly=demo" : ""}`,
            );
          },
        );

        published += 1;
      }

      console.log(
        `Published LPWAN uplink: ${published}/${states.size} device(s) @ ${new Date().toISOString()}`,
      );

      await sleep(Math.max(1000, INTERVAL_MS - delay));
    }
  });

  client.on("message", (topic, payload) => {
    const targetDevEui = parseDownlinkDevEui(topic);

    if (!targetDevEui) return;

    const state = states.get(targetDevEui);
    if (!state) return;

    let body: Record<string, unknown>;

    try {
      body = JSON.parse(payload.toString("utf8")) as Record<string, unknown>;
    } catch {
      console.warn("Invalid LPWAN downlink JSON");
      return;
    }

    if (body.type !== "lpwan:set") {
      console.warn(`Unknown LPWAN downlink type: ${String(body.type)}`);
      return;
    }

    if (typeof body.enabled !== "boolean") {
      console.warn("Invalid LPWAN downlink enabled value");
      return;
    }

    state.enabled = body.enabled;

    console.log(
      `LPWAN downlink received for ${targetDevEui}: enabled=${state.enabled}`,
    );
  });

  client.on("error", (err) => {
    console.error("MQTT error:", err.message);
  });

  client.on("reconnect", () => {
    console.log("LPWAN simulator reconnecting...");
  });

  client.on("offline", () => {
    console.log("LPWAN simulator offline");
  });

  client.on("close", () => {
    console.log("LPWAN simulator connection closed");
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
