import mqtt, { type MqttClient } from "mqtt";

import { env } from "../env";
import {
  createDeviceCommand,
  markDeviceCommandAcked,
  markDeviceCommandFailed,
  markDeviceCommandSent,
} from "../commands/service";
import { handleLpwanUplink } from "../lpwan/uplink";
import { saveTelemetryByDeviceUid } from "../telemetry/service";

let client: MqttClient | null = null;

function parseUidFromTelemetryTopic(topic: string): string | null {
  // Expected: iot/devices/<device_uid>/telemetry
  const parts = topic.split("/");
  if (parts.length < 4) return null;
  if (parts[0] !== "iot") return null;
  if (parts[1] !== "devices") return null;
  if (parts[3] !== "telemetry") return null;
  return parts[2] || null;
}

function parseUidFromCommandAckTopic(topic: string): string | null {
  // Expected: iot/devices/<device_uid>/cmd/ack
  const parts = topic.split("/");
  if (parts.length < 5) return null;
  if (parts[0] !== "iot") return null;
  if (parts[1] !== "devices") return null;
  if (parts[3] !== "cmd") return null;
  if (parts[4] !== "ack") return null;
  return parts[2] || null;
}

function parseDevEuiFromLpwanTopic(topic: string): string | null {
  // Expected: lpwan/uplink/<devEui>
  const parts = topic.split("/");
  if (parts.length < 3) return null;
  if (parts[0] !== "lpwan") return null;
  if (parts[1] !== "uplink") return null;
  return parts[2] || null;
}

export function startMqtt() {
  if (!env.MQTT_URL) return null;
  if (client) return client;

  console.log(`MQTT enabled. Connecting to ${env.MQTT_URL}`);

  client = mqtt.connect(env.MQTT_URL, {
    username: env.MQTT_USERNAME || undefined,
    password: env.MQTT_PASSWORD || undefined,
    reconnectPeriod: 2000,
  });

  client.on("connect", () => {
    console.log("MQTT connected");

    const topics = [
      env.MQTT_TELEMETRY_TOPIC,
      "iot/devices/+/cmd/ack",
      "lpwan/uplink/+",
    ];

    client?.subscribe(topics, (err) => {
      if (err) {
        console.error("MQTT subscribe error:", err.message);
        return;
      }

      console.log(`MQTT subscribed: ${topics.join(", ")}`);
    });
  });

  client.on("message", async (topic, payload) => {
    try {
      console.log(`MQTT message: ${topic}`);

      const text = payload.toString("utf8");
      const body = JSON.parse(text);

      const ackUid = parseUidFromCommandAckTopic(topic);
      if (ackUid) {
        const commandId =
          typeof body.commandId === "string" ? body.commandId.trim() : "";

        if (commandId) {
          await markDeviceCommandAcked({
            commandId,
            deviceUid: ackUid,
            ackPayload: body,
          });
        }

        return;
      }

      const lpwanDevEui = parseDevEuiFromLpwanTopic(topic);
      if (lpwanDevEui) {
        await handleLpwanUplink(lpwanDevEui, body);
        return;
      }

      const uid = parseUidFromTelemetryTopic(topic);
      if (uid) {
        await saveTelemetryByDeviceUid(uid, body);
      }
    } catch (err) {
      console.error(
        "MQTT message error:",
        err instanceof Error ? err.message : err,
      );
    }
  });

  client.on("error", (err) => {
    console.error("MQTT error:", err.message);
  });

  return client;
}

export async function publishDeviceCommand(
  uid: string,
  command: unknown,
  meta?: {
    deviceId?: string | null;
    userId?: string | null;
  },
) {
  if (!client || !client.connected) throw new Error("MQTT unavailable");

  const safeUid = (uid ?? "").trim();
  if (!safeUid) throw new Error("Invalid uid");

  const topic = `iot/devices/${safeUid}/cmd`;
  const baseCommand: Record<string, unknown> =
    command && typeof command === "object"
      ? { ...(command as Record<string, unknown>) }
      : { value: command };

  const commandType =
    typeof baseCommand["type"] === "string" ? baseCommand["type"] : "unknown";

  const commandLog =
    meta?.deviceId || meta?.userId
      ? await createDeviceCommand({
          deviceId: meta.deviceId ?? null,
          userId: meta.userId ?? null,
          deviceUid: safeUid,
          topic,
          type: commandType,
          payload: baseCommand,
        })
      : null;

  const commandWithId = commandLog
    ? { ...baseCommand, commandId: commandLog.id }
    : baseCommand;

  const payload = JSON.stringify(commandWithId);

  let sentCommandLog = commandLog;

  try {
    await new Promise<void>((resolve, reject) => {
      client?.publish(topic, payload, { qos: 0 }, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    if (commandLog) {
      sentCommandLog = await markDeviceCommandSent(commandLog.id);
    }
  } catch (err) {
    if (commandLog) {
      await markDeviceCommandFailed(
        commandLog.id,
        err instanceof Error ? err.message : "MQTT publish failed",
      );
    }

    throw err;
  }

  console.log(`MQTT command published: ${topic} ${payload}`);
  return sentCommandLog;
}

export async function publishLpwanDownlink(
  devEui: string,
  command: unknown,
  options: { retain?: boolean; qos?: 0 | 1 | 2 } = {},
) {
  if (!client || !client.connected) throw new Error("MQTT unavailable");

  const safeDevEui = (devEui ?? "").trim().toUpperCase();

  if (!safeDevEui) {
    throw new Error("Invalid devEui");
  }

  const topic = `lpwan/downlink/${safeDevEui}`;
  const payload = JSON.stringify(command ?? {});

  await new Promise<void>((resolve, reject) => {
    client?.publish(
      topic,
      payload,
      {
        qos: options.qos ?? 0,
        retain: options.retain ?? false,
      },
      (err) => {
        if (err) reject(err);
        else resolve();
      },
    );
  });

  console.log(`LPWAN downlink published: ${topic} ${payload}`);
}

export async function stopMqtt() {
  if (!client) return;
  await new Promise<void>((resolve) => {
    client?.end(false, {}, () => resolve());
  });
  client = null;
}
