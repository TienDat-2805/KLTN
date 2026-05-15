import {
  AlertSeverity,
  ConnectionType,
  DeviceJoinStatus,
  DeviceStatus,
  NetworkType,
  Prisma,
} from "@prisma/client";

import { createDeviceAlert } from "../alerts/service";
import { prisma } from "../db/prisma";
import { getIO, userRoom } from "../realtime/io";

type LpwanUplinkPayload = {
  devEui?: unknown;
  gatewayId?: unknown;
  networkType?: unknown;
  rssi?: unknown;
  snr?: unknown;
  spreadingFactor?: unknown;
  fCnt?: unknown;
  payload?: unknown;
  ts?: unknown;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function normalizeNetworkType(value: unknown): NetworkType {
  if (typeof value !== "string") return NetworkType.LORAWAN;

  const normalized = value.trim().toUpperCase().replace("-", "_");
  if (normalized === "NB_IOT") return NetworkType.NB_IOT;
  if (normalized === "LTE_M") return NetworkType.LTE_M;

  return NetworkType.LORAWAN;
}

function normalizeDevEui(value: string) {
  return value.trim().toUpperCase();
}

function shortDevEui(devEui: string) {
  const safe = normalizeDevEui(devEui).replace(/[^A-Z0-9]/g, "");
  return safe.slice(-6) || "UNKNOWN";
}

function buildAutoDeviceUid(devEui: string) {
  return `LPWAN_${shortDevEui(devEui)}`;
}

function buildAutoActivationCode(devEui: string) {
  return `LP-${shortDevEui(devEui)}`;
}

function buildAutoDeviceName(devEui: string) {
  return `LPWAN Device ${shortDevEui(devEui)}`;
}

function parseLpwanUplink(raw: unknown, topicDevEui?: string) {
  const body = (raw ?? {}) as LpwanUplinkPayload;
  const payload = (body.payload ?? {}) as Record<string, unknown>;

  const devEuiRaw =
    typeof body.devEui === "string" && body.devEui.trim()
      ? body.devEui.trim()
      : topicDevEui?.trim();

  if (!devEuiRaw) throw new Error("Missing devEui");

  const devEui = normalizeDevEui(devEuiRaw);

  const gatewayId =
    typeof body.gatewayId === "string" && body.gatewayId.trim()
      ? body.gatewayId.trim()
      : "GW-UNKNOWN";

  const tsRaw = body.ts;
  const ts = tsRaw ? new Date(tsRaw as string | number | Date) : new Date();

  if (Number.isNaN(ts.getTime())) {
    throw new Error("Invalid ts");
  }

  const temperatureC = isFiniteNumber(payload.temperatureC)
    ? payload.temperatureC
    : isFiniteNumber(payload.temperature)
      ? payload.temperature
      : undefined;

  const humidityPct = isFiniteNumber(payload.humidityPct)
    ? payload.humidityPct
    : isFiniteNumber(payload.humidity)
      ? payload.humidity
      : undefined;

  if (!isFiniteNumber(temperatureC)) {
    throw new Error("Invalid payload.temperatureC");
  }

  if (!isFiniteNumber(humidityPct)) {
    throw new Error("Invalid payload.humidityPct");
  }

  const rssi = isFiniteNumber(body.rssi) ? body.rssi : undefined;
  const snr = isFiniteNumber(body.snr) ? body.snr : undefined;
  const spreadingFactor = isInteger(body.spreadingFactor)
    ? body.spreadingFactor
    : undefined;
  const batteryPct = isFiniteNumber(payload.batteryPct)
    ? payload.batteryPct
    : undefined;
  const uplinkCounter = isInteger(body.fCnt) ? body.fCnt : undefined;

  return {
    devEui,
    gatewayId,
    networkType: normalizeNetworkType(body.networkType),
    ts,
    temperatureC,
    humidityPct,
    rssi,
    snr,
    spreadingFactor,
    batteryPct,
    uplinkCounter,
  };
}

const HIGH_TEMPERATURE_C = 35;
const LOW_BATTERY_PCT = 20;
const WEAK_RSSI_DBM = -115;
const WEAK_SNR_DB = -5;

function computeStatus(uplink: {
  temperatureC: number;
  batteryPct?: number;
  rssi?: number;
  snr?: number;
}): DeviceStatus {
  const highTemperature = uplink.temperatureC > HIGH_TEMPERATURE_C;

  const lowBattery =
    uplink.batteryPct !== undefined && uplink.batteryPct < LOW_BATTERY_PCT;

  const weakSignal =
    (uplink.rssi !== undefined && uplink.rssi < WEAK_RSSI_DBM) ||
    (uplink.snr !== undefined && uplink.snr < WEAK_SNR_DB);

  return highTemperature || lowBattery || weakSignal
    ? DeviceStatus.WARNING
    : DeviceStatus.ONLINE;
}

function warningReasons(uplink: {
  temperatureC: number;
  batteryPct?: number;
  rssi?: number;
  snr?: number;
}) {
  const reasons: string[] = [];

  if (uplink.temperatureC > HIGH_TEMPERATURE_C) {
    reasons.push(
      `temperature ${uplink.temperatureC}C is above ${HIGH_TEMPERATURE_C}C`,
    );
  }

  if (uplink.batteryPct !== undefined && uplink.batteryPct < LOW_BATTERY_PCT) {
    reasons.push(
      `battery ${uplink.batteryPct}% is below ${LOW_BATTERY_PCT}%`,
    );
  }

  if (uplink.rssi !== undefined && uplink.rssi < WEAK_RSSI_DBM) {
    reasons.push(`RSSI ${uplink.rssi}dBm is weaker than ${WEAK_RSSI_DBM}dBm`);
  }

  if (uplink.snr !== undefined && uplink.snr < WEAK_SNR_DB) {
    reasons.push(`SNR ${uplink.snr}dB is lower than ${WEAK_SNR_DB}dB`);
  }

  return reasons;
}

type CounterAnomaly = {
  type: "DUPLICATE_UPLINK" | "REPLAY_UPLINK";
  title: string;
  message: string;
  currentCounter: number;
  lastAcceptedCounter: number;
};

function detectCounterAnomaly(
  currentCounter: number | undefined,
  lastAcceptedCounter: number | null | undefined,
): CounterAnomaly | null {
  if (currentCounter === undefined) return null;
  if (lastAcceptedCounter === null || lastAcceptedCounter === undefined) {
    return null;
  }

  if (currentCounter === lastAcceptedCounter) {
    return {
      type: "DUPLICATE_UPLINK",
      title: "Duplicate LPWAN uplink ignored",
      message: `Device sent uplink counter ${currentCounter} again. The backend ignored this duplicate payload to avoid storing repeated telemetry.`,
      currentCounter,
      lastAcceptedCounter,
    };
  }

  if (currentCounter < lastAcceptedCounter) {
    return {
      type: "REPLAY_UPLINK",
      title: "Possible replayed LPWAN uplink ignored",
      message: `Device sent uplink counter ${currentCounter}, which is lower than the last accepted counter ${lastAcceptedCounter}. This may indicate replayed data or a device counter reset.`,
      currentCounter,
      lastAcceptedCounter,
    };
  }

  return null;
}

export async function handleLpwanUplink(
  topicDevEui: string | null,
  rawPayload: unknown,
) {
  const uplink = parseLpwanUplink(rawPayload, topicDevEui ?? undefined);
  const status = computeStatus(uplink);
  const reasons = status === DeviceStatus.WARNING ? warningReasons(uplink) : [];

  if (status === DeviceStatus.WARNING) {
    console.warn(`LPWAN warning for ${uplink.devEui}: ${reasons.join(", ")}`);
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      let device = await tx.device.findUnique({
        where: { devEui: uplink.devEui },
        select: {
          id: true,
          userId: true,
          devEui: true,
          deviceUid: true,
          name: true,
          isEnabled: true,
          status: true,
          lastSeenAt: true,
          gatewayId: true,
          lastRssi: true,
          lastSnr: true,
          lastSpreadingFactor: true,
          lastBatteryPct: true,
          lastUplinkCounter: true,
        },
      });
      let isNewDevice = false;

      if (device && !device.isEnabled) {
        return null;
      }

      if (!device) {
        isNewDevice = true;
        const created = await tx.device.create({
          data: {
            deviceUid: buildAutoDeviceUid(uplink.devEui),
            devEui: uplink.devEui,
            activationCode: buildAutoActivationCode(uplink.devEui),
            userId: null,

            name: buildAutoDeviceName(uplink.devEui),
            type: "Temperature",
            model: "LORA-AUTO",

            connectionType: ConnectionType.LPWAN,
            networkType: uplink.networkType,
            joinStatus: DeviceJoinStatus.UNCLAIMED,

            status,
            lastSeenAt: uplink.ts,
            lastJoinAt: uplink.ts,

            gatewayId: uplink.gatewayId,
            lastRssi: uplink.rssi,
            lastSnr: uplink.snr,
            lastSpreadingFactor: uplink.spreadingFactor,
            lastBatteryPct: uplink.batteryPct,
            lastUplinkCounter: uplink.uplinkCounter,
          },
          select: {
            id: true,
            userId: true,
            devEui: true,
            deviceUid: true,
            name: true,
            isEnabled: true,
            status: true,
            lastSeenAt: true,
            gatewayId: true,
            lastRssi: true,
            lastSnr: true,
            lastSpreadingFactor: true,
            lastBatteryPct: true,
            lastUplinkCounter: true,
          },
        });

        device = created;

        console.log(
          `LPWAN device auto-created: ${created.deviceUid} / DevEUI ${created.devEui} / activation ${buildAutoActivationCode(
            uplink.devEui,
          )}`,
        );
      }

      const counterAnomaly = isNewDevice
        ? null
        : detectCounterAnomaly(uplink.uplinkCounter, device.lastUplinkCounter);

      if (counterAnomaly) {
        console.warn(
          `${counterAnomaly.type} for ${uplink.devEui}: current=${counterAnomaly.currentCounter}, lastAccepted=${counterAnomaly.lastAcceptedCounter}`,
        );

        return {
          device,
          telemetry: null,
          previousStatus: device.status,
          counterAnomaly,
        };
      }

      const telemetry = await tx.telemetry.create({
        data: {
          deviceId: device.id,
          ts: uplink.ts,
          temperatureC: uplink.temperatureC,
          humidityPct: uplink.humidityPct,
          signalDbm: uplink.rssi,
          rssi: uplink.rssi,
          snr: uplink.snr,
          spreadingFactor: uplink.spreadingFactor,
          batteryPct: uplink.batteryPct,
          uplinkCounter: uplink.uplinkCounter,
        },
        select: {
          deviceId: true,
          ts: true,
          temperatureC: true,
          humidityPct: true,
          signalDbm: true,
          rssi: true,
          snr: true,
          spreadingFactor: true,
          batteryPct: true,
          uplinkCounter: true,
        },
      });

      const updatedDevice = await tx.device.update({
        where: { id: device.id },
        data: {
          status,
          lastSeenAt: uplink.ts,
          lastJoinAt: uplink.ts,

          connectionType: ConnectionType.LPWAN,
          networkType: uplink.networkType,
          joinStatus: device.userId
            ? DeviceJoinStatus.CLAIMED
            : DeviceJoinStatus.UNCLAIMED,

          gatewayId: uplink.gatewayId,
          lastRssi: uplink.rssi,
          lastSnr: uplink.snr,
          lastSpreadingFactor: uplink.spreadingFactor,
          lastBatteryPct: uplink.batteryPct,
          lastUplinkCounter: uplink.uplinkCounter,
        },
        select: {
          id: true,
          userId: true,
          status: true,
          lastSeenAt: true,
          gatewayId: true,
          lastRssi: true,
          lastSnr: true,
          lastSpreadingFactor: true,
          lastBatteryPct: true,
          lastUplinkCounter: true,
        },
      });

      return {
        device: updatedDevice,
        telemetry,
        previousStatus: device.status,
        counterAnomaly: null,
      };
    });

    if (!result) return null;

    if (result.device.userId && result.counterAnomaly) {
      await createDeviceAlert({
        deviceId: result.device.id,
        userId: result.device.userId,
        type: result.counterAnomaly.type,
        severity:
          result.counterAnomaly.type === "REPLAY_UPLINK"
            ? AlertSeverity.CRITICAL
            : AlertSeverity.WARNING,
        title: result.counterAnomaly.title,
        message: result.counterAnomaly.message,
        metadata: {
          devEui: uplink.devEui,
          gatewayId: uplink.gatewayId,
          currentCounter: result.counterAnomaly.currentCounter,
          lastAcceptedCounter: result.counterAnomaly.lastAcceptedCounter,
          ts: uplink.ts,
        },
      });
    }

    if (
      result.device.userId &&
      !result.counterAnomaly &&
      result.device.status === DeviceStatus.WARNING &&
      result.previousStatus !== DeviceStatus.WARNING
    ) {
      await createDeviceAlert({
        deviceId: result.device.id,
        userId: result.device.userId,
        type: "LPWAN_WARNING",
        title: "LPWAN radio or sensor warning",
        message: reasons.length
          ? `Device entered WARNING because ${reasons.join("; ")}.`
          : "LPWAN device entered warning state.",
        metadata: {
          devEui: uplink.devEui,
          gatewayId: uplink.gatewayId,
          temperatureC: uplink.temperatureC,
          batteryPct: uplink.batteryPct,
          rssi: uplink.rssi,
          snr: uplink.snr,
          spreadingFactor: uplink.spreadingFactor,
          ts: uplink.ts,
        },
      });
    }

    if (result.device.userId) {
      const io = getIO();
      const room = userRoom(result.device.userId);

      if (result.telemetry) {
        io?.to(room).emit("telemetry:new", {
          deviceId: result.telemetry.deviceId,
          ts: result.telemetry.ts,
          temperatureC: result.telemetry.temperatureC,
          humidityPct: result.telemetry.humidityPct,
          signalDbm: result.telemetry.signalDbm,
          rssi: result.telemetry.rssi,
          snr: result.telemetry.snr,
          spreadingFactor: result.telemetry.spreadingFactor,
          batteryPct: result.telemetry.batteryPct,
          uplinkCounter: result.telemetry.uplinkCounter,
        });
      }

      io?.to(room).emit("device:status", {
        deviceId: result.device.id,
        status: result.device.status,
        lastSeenAt: result.device.lastSeenAt,
      });

      io?.to(room).emit("device:lpwan", {
        deviceId: result.device.id,
        gatewayId: result.device.gatewayId,
        lastRssi: result.device.lastRssi,
        lastSnr: result.device.lastSnr,
        lastSpreadingFactor: result.device.lastSpreadingFactor,
        lastBatteryPct: result.device.lastBatteryPct,
        lastUplinkCounter: result.device.lastUplinkCounter,
      });
    }

    return result;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientInitializationError) {
      throw new Error("Database unavailable");
    }

    throw err;
  }
}
