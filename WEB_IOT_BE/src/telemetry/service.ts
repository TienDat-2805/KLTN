import { DeviceStatus, Prisma } from "@prisma/client";

import { createDeviceAlert } from "../alerts/service";
import { prisma } from "../db/prisma";
import { getIO, userRoom } from "../realtime/io";

export type TelemetryInput = {
  ts?: Date;
  temperatureC?: number;
  humidityPct?: number;
  signalDbm?: number;
  lightOn?: boolean;
  acOn?: boolean;
  acTargetTempC?: number;
  cameraFrameUrl?: string;
  batteryPct?: number;
  powerW?: number;
};

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function parseOptionalDate(value: unknown) {
  if (!value) return undefined;

  const ts = new Date(value as string | number | Date);
  if (Number.isNaN(ts.getTime())) throw new Error("Invalid ts");

  return ts;
}

function normalizeCameraFrame(raw: unknown) {
  if (typeof raw !== "string") return undefined;
  if (!raw.trim()) return undefined;
  if (raw.length > 250_000) return undefined;

  return raw.startsWith("data:") ? raw : `data:image/svg+xml;base64,${raw}`;
}

function parseTelemetryInput(raw: unknown): TelemetryInput {
  const body = (raw ?? {}) as Record<string, unknown>;

  const ts = parseOptionalDate(body.ts);

  const temperatureC = isFiniteNumber(body.temperatureC)
    ? body.temperatureC
    : isFiniteNumber(body.temperature)
      ? body.temperature
      : undefined;

  const humidityPct = isFiniteNumber(body.humidityPct)
    ? body.humidityPct
    : isFiniteNumber(body.humidity)
      ? body.humidity
      : undefined;

  const signalDbm = isFiniteNumber(body.signalDbm)
    ? body.signalDbm
    : isFiniteNumber(body.signal)
      ? body.signal
      : undefined;

  const lightOn = typeof body.lightOn === "boolean" ? body.lightOn : undefined;
  const acOn = typeof body.acOn === "boolean" ? body.acOn : undefined;

  const acTargetTempC = isFiniteNumber(body.acTargetTempC)
    ? body.acTargetTempC
    : undefined;

  const batteryPct = isFiniteNumber(body.batteryPct)
    ? body.batteryPct
    : undefined;

  const powerW = isFiniteNumber(body.powerW) ? body.powerW : undefined;

  const cameraFrameUrl = normalizeCameraFrame(body.cameraFrame);

  const hasTelemetry =
    isFiniteNumber(temperatureC) && isFiniteNumber(humidityPct);

  const hasRuntime =
    lightOn !== undefined ||
    acOn !== undefined ||
    acTargetTempC !== undefined ||
    batteryPct !== undefined ||
    powerW !== undefined;

  const hasCamera = cameraFrameUrl !== undefined;

  if (!hasTelemetry && !hasRuntime && !hasCamera) {
    throw new Error("Unsupported telemetry payload");
  }

  if (temperatureC !== undefined && !isFiniteNumber(temperatureC)) {
    throw new Error("Invalid temperatureC");
  }

  if (humidityPct !== undefined && !isFiniteNumber(humidityPct)) {
    throw new Error("Invalid humidityPct");
  }

  return {
    ts,
    ...(temperatureC !== undefined ? { temperatureC } : {}),
    ...(humidityPct !== undefined ? { humidityPct } : {}),
    ...(signalDbm !== undefined ? { signalDbm } : {}),
    ...(lightOn !== undefined ? { lightOn } : {}),
    ...(acOn !== undefined ? { acOn } : {}),
    ...(acTargetTempC !== undefined ? { acTargetTempC } : {}),
    ...(cameraFrameUrl !== undefined ? { cameraFrameUrl } : {}),
    ...(batteryPct !== undefined ? { batteryPct } : {}),
    ...(powerW !== undefined ? { powerW } : {}),
  };
}

function hasNumericTelemetry(t: TelemetryInput) {
  return isFiniteNumber(t.temperatureC) && isFiniteNumber(t.humidityPct);
}

function computeOnlineOrWarning(t: TelemetryInput): DeviceStatus {
  if (hasNumericTelemetry(t) && (t.temperatureC ?? 0) > 35) {
    return DeviceStatus.WARNING;
  }

  return DeviceStatus.ONLINE;
}

export async function saveTelemetryByDeviceId(
  deviceId: string,
  rawTelemetry: unknown,
) {
  const telemetry = parseTelemetryInput(rawTelemetry);
  const ts = telemetry.ts ?? new Date();
  const status = computeOnlineOrWarning(telemetry);
  const shouldCreateTelemetry = hasNumericTelemetry(telemetry);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const device = await tx.device.findUnique({
        where: { id: deviceId },
        select: {
          id: true,
          userId: true,
          isEnabled: true,
          status: true,
        },
      });

      if (!device) return null;

      if (!device.isEnabled) {
        return null;
      }

      if (!device) return null;

      const createdTelemetry = shouldCreateTelemetry
        ? await tx.telemetry.create({
            data: {
              deviceId,
              ts,
              temperatureC: telemetry.temperatureC as number,
              humidityPct: telemetry.humidityPct as number,
              signalDbm: telemetry.signalDbm,
              rssi: telemetry.signalDbm,
              batteryPct: telemetry.batteryPct,
            },
            select: {
              deviceId: true,
              ts: true,
              temperatureC: true,
              humidityPct: true,
              signalDbm: true,
              rssi: true,
              batteryPct: true,
            },
          })
        : null;

      await tx.device.update({
        where: { id: deviceId },
        data: {
          lastSeenAt: ts,
          status,

          ...(telemetry.signalDbm !== undefined
            ? { lastRssi: telemetry.signalDbm }
            : {}),

          ...(telemetry.batteryPct !== undefined
            ? { lastBatteryPct: telemetry.batteryPct }
            : {}),

          ...(telemetry.lightOn !== undefined
            ? { lightOn: telemetry.lightOn }
            : {}),

          ...(telemetry.acOn !== undefined ? { acOn: telemetry.acOn } : {}),

          ...(telemetry.acTargetTempC !== undefined
            ? { acTargetTempC: Math.round(telemetry.acTargetTempC) }
            : {}),

          ...(telemetry.cameraFrameUrl !== undefined
            ? { cameraFrameUrl: telemetry.cameraFrameUrl }
            : {}),
        },
        select: { id: true },
      });

      return {
        device,
        telemetry: createdTelemetry,
        runtime: {
          lightOn: telemetry.lightOn,
          acOn: telemetry.acOn,
          acTargetTempC: telemetry.acTargetTempC,
          batteryPct: telemetry.batteryPct,
          powerW: telemetry.powerW,
          signalDbm: telemetry.signalDbm,
        },
        cameraFrameUrl: telemetry.cameraFrameUrl,
        status,
        lastSeenAt: ts,
      };
    });

    if (!result) return null;

    if (
      result.device.userId &&
      result.status === DeviceStatus.WARNING &&
      result.device.status !== DeviceStatus.WARNING
    ) {
      await createDeviceAlert({
        deviceId,
        userId: result.device.userId,
        type: "HIGH_TEMPERATURE",
        title: "High temperature detected",
        message: `Temperature reached ${telemetry.temperatureC}C, above the 35C warning threshold.`,
        metadata: {
          temperatureC: telemetry.temperatureC,
          thresholdC: 35,
          ts: result.lastSeenAt,
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
          batteryPct: result.telemetry.batteryPct,
        });
      }

      io?.to(room).emit("device:status", {
        deviceId,
        status: result.status,
        lastSeenAt: result.lastSeenAt,
      });

      const runtimePayload: Record<string, unknown> = {};

      if (result.runtime.lightOn !== undefined) {
        runtimePayload.lightOn = result.runtime.lightOn;
      }

      if (result.runtime.acOn !== undefined) {
        runtimePayload.acOn = result.runtime.acOn;
      }

      if (result.runtime.acTargetTempC !== undefined) {
        runtimePayload.acTargetTempC = result.runtime.acTargetTempC;
      }

      if (result.runtime.batteryPct !== undefined) {
        runtimePayload.batteryPct = result.runtime.batteryPct;
      }

      if (result.runtime.powerW !== undefined) {
        runtimePayload.powerW = result.runtime.powerW;
      }

      if (result.runtime.signalDbm !== undefined) {
        runtimePayload.signalDbm = result.runtime.signalDbm;
      }

      if (Object.keys(runtimePayload).length > 0) {
        io?.to(room).emit("device:runtime", {
          deviceId,
          ...runtimePayload,
        });
      }

      if (result.cameraFrameUrl !== undefined) {
        io?.to(room).emit("camera:frame", {
          deviceId,
          ts: result.lastSeenAt,
          dataUrl: result.cameraFrameUrl,
        });
      }
    }

    return result;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientInitializationError) {
      throw new Error("Database unavailable");
    }

    throw err;
  }
}

export async function saveTelemetryByDeviceUid(
  deviceUid: string,
  rawTelemetry: unknown,
) {
  const safeUid = (deviceUid ?? "").trim();

  if (!safeUid) return null;

  const device = await prisma.device.findUnique({
    where: { deviceUid: safeUid },
    select: { id: true },
  });

  if (!device) return null;

  return saveTelemetryByDeviceId(device.id, rawTelemetry);
}
