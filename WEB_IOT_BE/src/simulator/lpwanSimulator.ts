import "dotenv/config";
import mqtt from "mqtt";

const MQTT_URL = process.env.MQTT_URL || "mqtt://localhost:1883";

const DEV_EUI = (process.env.LPWAN_DEV_EUI || "70B3D57ED005A001")
  .trim()
  .toUpperCase();

const GATEWAY_ID = process.env.LPWAN_GATEWAY_ID || "GW-HANOI-01";
const INTERVAL_MS = Number(process.env.LPWAN_INTERVAL_MS || 5000);

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

async function main() {
  console.log(`LoRaWAN-like simulator connecting to ${MQTT_URL}`);
  console.log(`DevEUI: ${DEV_EUI}`);
  console.log(`Gateway: ${GATEWAY_ID}`);

  const client = mqtt.connect(MQTT_URL, {
    reconnectPeriod: 2000,
  });

  let fCnt = 0;
  let enabled = true;
  let batteryPct = randomBetween(85, 100, 1);
  let temperatureC = randomBetween(25, 31, 1);
  let humidityPct = randomBetween(55, 75, 1);

  const uplinkTopic = `lpwan/uplink/${DEV_EUI}`;
  const downlinkTopic = `lpwan/downlink/${DEV_EUI}`;

  client.on("connect", async () => {
    console.log("LoRaWAN-like simulator connected");

    client.subscribe(downlinkTopic, (err) => {
      if (err) {
        console.error("LPWAN downlink subscribe error:", err.message);
        return;
      }

      console.log(`LPWAN simulator subscribed: ${downlinkTopic}`);
    });

    while (true) {
      const delay = randomInt(1000, 3000);
      await sleep(delay);

      if (!enabled) {
        console.log(
          `LPWAN disabled: no uplink sent for ${DEV_EUI}. Waiting for downlink enable...`,
        );

        await sleep(Math.max(1000, INTERVAL_MS - delay));
        continue;
      }

      fCnt += 1;

      temperatureC = randomBetween(
        Math.max(20, temperatureC - 1.5),
        Math.min(40, temperatureC + 1.5),
        1,
      );

      humidityPct = randomBetween(
        Math.max(35, humidityPct - 3),
        Math.min(90, humidityPct + 3),
        1,
      );

      batteryPct = Math.max(0, Number((batteryPct - 0.03).toFixed(1)));

      const rssi = randomInt(-122, -82);
      const snr = randomBetween(-6, 12, 1);
      const spreadingFactor = randomInt(7, 12);

      const payload = {
        devEui: DEV_EUI,
        gatewayId: GATEWAY_ID,
        networkType: "LORAWAN",
        rssi,
        snr,
        spreadingFactor,
        fCnt,
        ts: new Date().toISOString(),
        payload: {
          temperatureC,
          humidityPct,
          batteryPct,
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
            `LPWAN uplink #${fCnt} -> ${uplinkTopic} | enabled=${enabled} temp=${temperatureC}C hum=${humidityPct}% rssi=${rssi}dBm snr=${snr} SF${spreadingFactor} battery=${batteryPct}%`,
          );
        },
      );

      await sleep(Math.max(1000, INTERVAL_MS - delay));
    }
  });

  client.on("message", (topic, payload) => {
    const targetDevEui = parseDownlinkDevEui(topic);

    if (!targetDevEui) return;
    if (targetDevEui !== DEV_EUI) return;

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

    enabled = body.enabled;

    console.log(`LPWAN downlink received for ${DEV_EUI}: enabled=${enabled}`);
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
