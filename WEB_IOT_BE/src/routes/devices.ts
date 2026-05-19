import { Router } from "express";
import {
  ConnectionType,
  DeviceJoinStatus,
  DeviceStatus,
} from "@prisma/client";

import { prisma } from "../db/prisma";
import { protocolAdapters } from "../ingestion/protocols";
import { calculateLpwanHealth } from "../lpwan/health";
import { requireAuth } from "../middleware/requireAuth";
import { publishDeviceCommand, publishLpwanDownlink } from "../mqtt/client";
import { getIO, userRoom } from "../realtime/io";

type DiscoverMethod = "wired" | "lpwan";

type LatestTelemetry = {
  ts: Date;
  temperatureC: number;
  humidityPct: number;
  signalDbm: number | null;
  rssi?: number | null;
  snr?: number | null;
  spreadingFactor?: number | null;
  batteryPct?: number | null;
  uplinkCounter?: number | null;
};

function discoverMethodFromQuery(value: unknown): DiscoverMethod | null {
  if (value === "wired" || value === "lpwan") {
    return value;
  }

  return null;
}

function mapTelemetry(t: LatestTelemetry | null) {
  if (!t) return null;

  return {
    ts: t.ts,
    temperatureC: t.temperatureC,
    humidityPct: t.humidityPct,
    signalDbm: t.signalDbm,
    rssi: t.rssi ?? null,
    snr: t.snr ?? null,
    spreadingFactor: t.spreadingFactor ?? null,
    batteryPct: t.batteryPct ?? null,
    uplinkCounter: t.uplinkCounter ?? null,
  };
}

function parseOptionalDateQuery(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return undefined;

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error("Invalid date");

  return d;
}

function mapDiscoverDevice<T extends { userId: string | null }>(
  device: T,
  currentUserId: string,
) {
  const { userId, ...safeDevice } = device;

  const claimedByCurrentUser = userId === currentUserId;
  const claimedByOtherUser = Boolean(userId && userId !== currentUserId);
  const claimable = !userId;

  return {
    ...safeDevice,
    claimable,
    claimedByCurrentUser,
    claimedByOtherUser,
    claimStatusLabel: claimedByOtherUser
      ? "CLAIMED_BY_OTHER_USER"
      : claimedByCurrentUser
        ? "CLAIMED_BY_CURRENT_USER"
        : "AVAILABLE",
  };
}

function getConnectionTypeFromMethod(method: DiscoverMethod) {
  if (method === "wired") return ConnectionType.WIRED;
  return ConnectionType.LPWAN;
}

function canonicalDeviceType(type: string | null | undefined) {
  return (type ?? "").trim().toLowerCase().replace(/[\s_-]+/g, " ");
}

function isLightDevice(type: string | null | undefined) {
  const t = canonicalDeviceType(type);
  return t === "light" || t === "lamp";
}

function isAirConditionerDevice(type: string | null | undefined) {
  const t = canonicalDeviceType(type);
  return t === "air conditioner" || t === "ac" || t === "a c";
}

function emitRuntimeUpdate(
  userId: string,
  payload: {
    deviceId: string;
    lightOn?: boolean;
    acOn?: boolean;
    acTargetTempC?: number;
  },
) {
  getIO()?.to(userRoom(userId)).emit("device:runtime", payload);
}

async function enableStandardVirtualDevice(
  deviceUid: string | null | undefined,
) {
  const uid = (deviceUid ?? "").trim();
  if (!uid) return;

  try {
    await publishDeviceCommand(uid, {
      type: "device:set",
      enabled: true,
    });
  } catch (err) {
    console.warn(`Could not enable virtual device ${uid}:`, err);
  }
}

async function disableStandardVirtualDevice(
  deviceUid: string | null | undefined,
) {
  const uid = (deviceUid ?? "").trim();
  if (!uid) return;

  try {
    await publishDeviceCommand(uid, {
      type: "device:set",
      enabled: false,
    });
  } catch (err) {
    console.warn(`Could not disable virtual device ${uid}:`, err);
  }
}

async function enableLpwanVirtualDevice(devEui: string | null | undefined) {
  const safeDevEui = (devEui ?? "").trim();
  if (!safeDevEui) return;

  try {
    await publishLpwanDownlink(
      safeDevEui,
      {
        type: "lpwan:set",
        enabled: true,
      },
      {
        qos: 1,
        retain: true,
      },
    );
  } catch (err) {
    console.warn(`Could not enable LPWAN device ${safeDevEui}:`, err);
  }
}

async function disableLpwanVirtualDevice(devEui: string | null | undefined) {
  const safeDevEui = (devEui ?? "").trim();
  if (!safeDevEui) return;

  try {
    await publishLpwanDownlink(
      safeDevEui,
      {
        type: "lpwan:set",
        enabled: false,
      },
      {
        qos: 1,
        retain: true,
      },
    );
  } catch (err) {
    console.warn(`Could not disable LPWAN device ${safeDevEui}:`, err);
  }
}

const baseDeviceSelect = {
  id: true,
  userId: true,
  deviceUid: true,
  devEui: true,
  name: true,
  type: true,
  model: true,

  connectionType: true,
  networkType: true,
  joinStatus: true,
  gatewayId: true,
  lastJoinAt: true,
  lastRssi: true,
  lastSnr: true,
  lastSpreadingFactor: true,
  lastBatteryPct: true,
  lastUplinkCounter: true,

  lightOn: true,
  acOn: true,
  acTargetTempC: true,
  cameraFrameUrl: true,

  isEnabled: true,
  status: true,
  lastSeenAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

const telemetrySelect = {
  ts: true,
  temperatureC: true,
  humidityPct: true,
  signalDbm: true,
  rssi: true,
  snr: true,
  spreadingFactor: true,
  batteryPct: true,
  uplinkCounter: true,
} as const;

export const devicesRouter = Router();

devicesRouter.use(requireAuth);

devicesRouter.get("/", async (req, res) => {
  const userId = req.user!.id;

  const devices = await prisma.device.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: baseDeviceSelect,
  });

  const deviceIds = devices.map((d) => d.id);

  const latestTelemetryRows = deviceIds.length
    ? await prisma.telemetry.findMany({
        where: { deviceId: { in: deviceIds } },
        orderBy: [{ deviceId: "asc" }, { ts: "desc" }],
        distinct: ["deviceId"],
        select: {
          deviceId: true,
          ...telemetrySelect,
        },
      })
    : [];

  const latestByDeviceId = new Map<string, LatestTelemetry>();

  for (const row of latestTelemetryRows) {
    latestByDeviceId.set(row.deviceId, {
      ts: row.ts,
      temperatureC: row.temperatureC,
      humidityPct: row.humidityPct,
      signalDbm: row.signalDbm ?? null,
      rssi: row.rssi ?? null,
      snr: row.snr ?? null,
      spreadingFactor: row.spreadingFactor ?? null,
      batteryPct: row.batteryPct ?? null,
      uplinkCounter: row.uplinkCounter ?? null,
    });
  }

  return res.json({
    devices: devices.map((d) => {
      const latestTelemetry = latestByDeviceId.get(d.id) ?? null;
      const { userId: _userId, ...safeDevice } = d;

      return {
        ...safeDevice,
        lastSeenAt: d.lastSeenAt ?? latestTelemetry?.ts ?? null,
        latestTelemetry: mapTelemetry(latestTelemetry),
      };
    }),
  });
});

devicesRouter.get("/discover", async (req, res) => {
  const userId = req.user!.id;
  const method = discoverMethodFromQuery(req.query.method);

  if (!method) {
    return res
      .status(400)
      .json({ error: "Invalid method (use wired|lpwan)" });
  }

  const connectionType = getConnectionTypeFromMethod(method);

  const devices = await prisma.device.findMany({
    where: {
      connectionType,
    },
    orderBy: { updatedAt: "desc" },
    select: baseDeviceSelect,
  });

  return res.json({
    devices: devices.map((device) => mapDiscoverDevice(device, userId)),
  });
});

devicesRouter.get("/protocols", (_req, res) => {
  return res.json({
    protocols: protocolAdapters,
  });
});

devicesRouter.post("/claim", async (req, res) => {
  const userId = req.user!.id;
  const { activationCode, name } = (req.body ?? {}) as {
    activationCode?: unknown;
    name?: unknown;
  };

  if (typeof activationCode !== "string" || !activationCode.trim()) {
    return res.status(400).json({ error: "Missing activationCode" });
  }

  const nextName = typeof name === "string" ? name.trim() : "";

  const found = await prisma.device.findUnique({
    where: { activationCode: activationCode.trim() },
    select: {
      id: true,
      deviceUid: true,
      devEui: true,
      userId: true,
      connectionType: true,
    },
  });

  if (!found) return res.status(404).json({ error: "Device not found" });

  if (found.userId) {
    return res.status(400).json({ error: "Device already claimed" });
  }

  const updated = await prisma.device.update({
    where: { id: found.id },
    data: {
      userId,
      isEnabled: true,
      ...(nextName ? { name: nextName } : {}),
      joinStatus: DeviceJoinStatus.CLAIMED,
      ...(found.connectionType === ConnectionType.LPWAN
        ? {
            status: DeviceStatus.OFFLINE,
            lastSeenAt: null,
            lastUplinkCounter: null,
          }
        : {}),
    },
    select: baseDeviceSelect,
  });

  if (found.connectionType === ConnectionType.LPWAN) {
    await enableLpwanVirtualDevice(found.devEui);
  } else {
    await enableStandardVirtualDevice(found.deviceUid);
  }

  const { userId: _userId, ...safeDevice } = updated;

  return res.status(200).json({
    device: {
      ...safeDevice,
      latestTelemetry: null,
    },
    message: "Device claimed. Waiting for telemetry update...",
  });
});

devicesRouter.post("/claim-lpwan", async (req, res) => {
  const userId = req.user!.id;
  const { devEui, activationCode, name } = (req.body ?? {}) as {
    devEui?: unknown;
    activationCode?: unknown;
    name?: unknown;
  };

  if (typeof devEui !== "string" || !devEui.trim()) {
    return res.status(400).json({ error: "Missing devEui" });
  }

  if (typeof activationCode !== "string" || !activationCode.trim()) {
    return res.status(400).json({ error: "Missing activationCode" });
  }

  const nextName = typeof name === "string" ? name.trim() : "";
  if (!nextName) return res.status(400).json({ error: "Missing name" });

  const found = await prisma.device.findUnique({
    where: { devEui: devEui.trim().toUpperCase() },
    select: {
      id: true,
      devEui: true,
      activationCode: true,
      userId: true,
      connectionType: true,
    },
  });

  if (!found) return res.status(404).json({ error: "LPWAN device not found" });

  if (found.connectionType !== ConnectionType.LPWAN) {
    return res.status(400).json({ error: "Device is not an LPWAN device" });
  }

  if (found.userId) {
    return res.status(400).json({ error: "Device already claimed" });
  }

  if (found.activationCode !== activationCode.trim()) {
    return res.status(400).json({ error: "Invalid activation code" });
  }

  const updated = await prisma.device.update({
    where: { id: found.id },
    data: {
      userId,
      isEnabled: true,
      name: nextName,
      joinStatus: DeviceJoinStatus.CLAIMED,
      status: DeviceStatus.OFFLINE,
      lastSeenAt: null,
      lastUplinkCounter: null,
    },
    select: baseDeviceSelect,
  });

  await enableLpwanVirtualDevice(found.devEui);

  const latestTelemetry = await prisma.telemetry.findFirst({
    where: { deviceId: updated.id },
    orderBy: { ts: "desc" },
    select: telemetrySelect,
  });

  const { userId: _userId, ...safeDevice } = updated;

  return res.status(200).json({
    device: {
      ...safeDevice,
      latestTelemetry: latestTelemetry
        ? mapTelemetry({
            ...latestTelemetry,
            signalDbm: latestTelemetry.signalDbm ?? null,
            rssi: latestTelemetry.rssi ?? null,
            snr: latestTelemetry.snr ?? null,
            spreadingFactor: latestTelemetry.spreadingFactor ?? null,
            batteryPct: latestTelemetry.batteryPct ?? null,
            uplinkCounter: latestTelemetry.uplinkCounter ?? null,
          })
        : null,
    },
    message: "LPWAN device claimed. Waiting for next uplink.",
  });
});

devicesRouter.post("/claim-wired", async (req, res) => {
  const userId = req.user!.id;
  const { deviceUid } = (req.body ?? {}) as { deviceUid?: unknown };

  if (typeof deviceUid !== "string" || !deviceUid.trim()) {
    return res.status(400).json({ error: "Missing deviceUid" });
  }

  const found = await prisma.device.findUnique({
    where: { deviceUid: deviceUid.trim() },
    select: {
      id: true,
      deviceUid: true,
      userId: true,
      connectionType: true,
      status: true,
    },
  });

  if (!found) return res.status(404).json({ error: "Device not found" });

  if (found.connectionType !== ConnectionType.WIRED) {
    return res.status(400).json({ error: "Device is not a wired device" });
  }

  if (found.userId) {
    return res.status(400).json({ error: "Device already claimed" });
  }

  const updated = await prisma.device.update({
    where: { id: found.id },
    data: {
      userId,
      isEnabled: true,
      joinStatus: DeviceJoinStatus.CLAIMED,
    },
    select: baseDeviceSelect,
  });

  await enableStandardVirtualDevice(found.deviceUid);

  const { userId: _userId, ...safeDevice } = updated;

  return res.status(200).json({
    device: {
      ...safeDevice,
      latestTelemetry: null,
    },
    message: "Device claimed. Waiting for telemetry update...",
  });
});

devicesRouter.patch("/:id/enabled", async (req, res) => {
  const userId = req.user!.id;
  const deviceId = req.params.id;
  const { enabled } = (req.body ?? {}) as { enabled?: unknown };

  if (typeof enabled !== "boolean") {
    return res.status(400).json({ error: "Invalid enabled" });
  }

  const device = await prisma.device.findFirst({
    where: {
      id: deviceId,
      userId,
    },
    select: {
      id: true,
      deviceUid: true,
      devEui: true,
      connectionType: true,
    },
  });

  if (!device) {
    return res.status(404).json({ error: "Device not found" });
  }

  if (device.connectionType === ConnectionType.LPWAN && !device.devEui) {
    return res.status(400).json({ error: "LPWAN device missing devEui" });
  }

  if (device.connectionType !== ConnectionType.LPWAN) {
    try {
      await publishDeviceCommand(
        device.deviceUid,
        {
          type: "device:set",
          enabled,
        },
        {
          deviceId: device.id,
          userId,
        },
      );
    } catch {
      return res.status(503).json({ error: "MQTT unavailable" });
    }
  }

  const updated = await prisma.device.update({
    where: { id: device.id },
    data: {
      isEnabled: enabled,
      status: DeviceStatus.OFFLINE,
      ...(enabled
        ? device.connectionType === ConnectionType.LPWAN
          ? { lastUplinkCounter: null }
          : {}
        : {
            lastSeenAt: null,
            lightOn: false,
            acOn: false,
          }),
    },
    select: {
      ...baseDeviceSelect,
      telemetry: {
        orderBy: { ts: "desc" },
        take: 1,
        select: telemetrySelect,
      },
    },
  });

  const latestTelemetry = updated.telemetry[0] ?? null;
  const { telemetry, userId: _userId, ...deviceWithoutTelemetry } = updated;
  let lpwanDownlinkSent: boolean | undefined;
  let lpwanDownlinkError: string | undefined;

  if (device.connectionType === ConnectionType.LPWAN && device.devEui) {
    try {
      await publishLpwanDownlink(
        device.devEui,
        {
          type: "lpwan:set",
          enabled,
        },
        {
          qos: 1,
          retain: true,
        },
      );
      lpwanDownlinkSent = true;
    } catch (err) {
      lpwanDownlinkSent = false;
      lpwanDownlinkError =
        err instanceof Error ? err.message : "MQTT downlink unavailable";
      console.warn(
        `Could not publish LPWAN ${enabled ? "enable" : "disable"} downlink for ${device.devEui}: ${lpwanDownlinkError}`,
      );
    }
  }

  const lpwanMessage =
    device.connectionType === ConnectionType.LPWAN
      ? enabled
        ? lpwanDownlinkSent === false
          ? "LPWAN device enabled in backend. Downlink could not be sent; check MQTT broker or simulator."
          : "LPWAN device enabled. Waiting for next uplink."
        : lpwanDownlinkSent === false
          ? "LPWAN device disabled in backend. Downlink could not be sent; backend will ignore uplinks until enabled again."
          : "LPWAN device disabled."
      : null;

  return res.status(200).json({
    device: {
      ...deviceWithoutTelemetry,
      lastSeenAt: updated.lastSeenAt ?? latestTelemetry?.ts ?? null,
      latestTelemetry: latestTelemetry
        ? mapTelemetry({
            ...latestTelemetry,
            signalDbm: latestTelemetry.signalDbm ?? null,
            rssi: latestTelemetry.rssi ?? null,
            snr: latestTelemetry.snr ?? null,
            spreadingFactor: latestTelemetry.spreadingFactor ?? null,
            batteryPct: latestTelemetry.batteryPct ?? null,
            uplinkCounter: latestTelemetry.uplinkCounter ?? null,
          })
        : null,
    },
    message:
      lpwanMessage ??
      (enabled
        ? "Device enable command sent. Waiting for telemetry update."
        : "Device disabled."),
    ...(lpwanDownlinkSent === undefined
      ? {}
      : { downlinkSent: lpwanDownlinkSent }),
    ...(lpwanDownlinkError ? { downlinkError: lpwanDownlinkError } : {}),
  });
});

devicesRouter.get("/:id/commands", async (req, res) => {
  const userId = req.user!.id;
  const deviceId = req.params.id;
  const rawLimit = Number(req.query.limit ?? 20);
  const limit = Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(100, Math.trunc(rawLimit)))
    : 20;

  const device = await prisma.device.findFirst({
    where: { id: deviceId, userId },
    select: { id: true },
  });

  if (!device) return res.status(404).json({ error: "Device not found" });

  const commands = await prisma.deviceCommand.findMany({
    where: { deviceId, userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      deviceId: true,
      deviceUid: true,
      topic: true,
      type: true,
      payload: true,
      status: true,
      error: true,
      ackPayload: true,
      sentAt: true,
      ackAt: true,
      timedOutAt: true,
      createdAt: true,
    },
  });

  return res.json({ commands });
});

devicesRouter.get("/:id/telemetry", async (req, res) => {
  const userId = req.user!.id;
  const deviceId = req.params.id;
  const rawLimit = Number(req.query.limit ?? 120);
  const limit = Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(500, Math.trunc(rawLimit)))
    : 120;

  let from: Date | undefined;
  let to: Date | undefined;

  try {
    from = parseOptionalDateQuery(req.query.from);
    to = parseOptionalDateQuery(req.query.to);
  } catch {
    return res.status(400).json({ error: "Invalid from or to date" });
  }

  const device = await prisma.device.findFirst({
    where: { id: deviceId, userId },
    select: { id: true },
  });

  if (!device) return res.status(404).json({ error: "Device not found" });

  const telemetry = await prisma.telemetry.findMany({
    where: {
      deviceId,
      ...(from || to
        ? {
            ts: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    },
    orderBy: { ts: "desc" },
    take: limit,
    select: telemetrySelect,
  });

  return res.json({
    telemetry: telemetry.reverse().map((t) =>
      mapTelemetry({
        ...t,
        signalDbm: t.signalDbm ?? null,
        rssi: t.rssi ?? null,
        snr: t.snr ?? null,
        spreadingFactor: t.spreadingFactor ?? null,
        batteryPct: t.batteryPct ?? null,
        uplinkCounter: t.uplinkCounter ?? null,
      }),
    ),
  });
});

devicesRouter.get("/:id/lpwan-health", async (req, res) => {
  const userId = req.user!.id;
  const deviceId = req.params.id;

  const device = await prisma.device.findFirst({
    where: { id: deviceId, userId },
    select: {
      id: true,
      name: true,
      deviceUid: true,
      devEui: true,
      connectionType: true,
      networkType: true,
      gatewayId: true,
      lastJoinAt: true,
      lastSeenAt: true,
      lastRssi: true,
      lastSnr: true,
      lastSpreadingFactor: true,
      lastBatteryPct: true,
      lastUplinkCounter: true,
      status: true,
    },
  });

  if (!device) return res.status(404).json({ error: "Device not found" });

  if (device.connectionType !== ConnectionType.LPWAN && !device.devEui) {
    return res.status(400).json({ error: "Device is not an LPWAN device" });
  }

  const { connectionType: _connectionType, ...healthDevice } = device;

  return res.json({
    health: calculateLpwanHealth(healthDevice),
  });
});

devicesRouter.get("/:id/alerts", async (req, res) => {
  const userId = req.user!.id;
  const deviceId = req.params.id;
  const rawLimit = Number(req.query.limit ?? 20);
  const limit = Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(100, Math.trunc(rawLimit)))
    : 20;

  const device = await prisma.device.findFirst({
    where: { id: deviceId, userId },
    select: { id: true },
  });

  if (!device) return res.status(404).json({ error: "Device not found" });

  const alerts = await prisma.deviceAlert.findMany({
    where: { deviceId, userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      deviceId: true,
      type: true,
      severity: true,
      title: true,
      message: true,
      metadata: true,
      isRead: true,
      readAt: true,
      createdAt: true,
    },
  });

  return res.json({ alerts });
});

devicesRouter.patch("/:id/alerts/:alertId/read", async (req, res) => {
  const userId = req.user!.id;
  const { id: deviceId, alertId } = req.params;

  const alert = await prisma.deviceAlert.findFirst({
    where: {
      id: alertId,
      deviceId,
      userId,
    },
    select: { id: true },
  });

  if (!alert) return res.status(404).json({ error: "Alert not found" });

  const updated = await prisma.deviceAlert.update({
    where: { id: alert.id },
    data: {
      isRead: true,
      readAt: new Date(),
    },
    select: {
      id: true,
      deviceId: true,
      type: true,
      severity: true,
      title: true,
      message: true,
      metadata: true,
      isRead: true,
      readAt: true,
      createdAt: true,
    },
  });

  return res.json({ alert: updated });
});

devicesRouter.patch("/:id", async (req, res) => {
  const userId = req.user!.id;
  const id = req.params.id;
  const { name, type } = (req.body ?? {}) as { name?: string; type?: string };

  if (!name && !type) {
    return res.status(400).json({ error: "Nothing to update" });
  }

  const updated = await prisma.device.updateMany({
    where: { id, userId },
    data: {
      ...(name ? { name } : {}),
      ...(type ? { type } : {}),
    },
  });

  if (updated.count === 0) {
    return res.status(404).json({ error: "Device not found" });
  }

  const device = await prisma.device.findFirst({
    where: { id, userId },
    select: {
      ...baseDeviceSelect,
      telemetry: {
        orderBy: { ts: "desc" },
        take: 1,
        select: telemetrySelect,
      },
    },
  });

  if (!device) return res.status(404).json({ error: "Device not found" });

  const latestTelemetry = device.telemetry[0] ?? null;
  const { telemetry, userId: _userId, ...deviceWithoutTelemetry } = device;

  return res.json({
    device: {
      ...deviceWithoutTelemetry,
      lastSeenAt: device.lastSeenAt ?? latestTelemetry?.ts ?? null,
      latestTelemetry: latestTelemetry
        ? mapTelemetry({
            ...latestTelemetry,
            signalDbm: latestTelemetry.signalDbm ?? null,
            rssi: latestTelemetry.rssi ?? null,
            snr: latestTelemetry.snr ?? null,
            spreadingFactor: latestTelemetry.spreadingFactor ?? null,
            batteryPct: latestTelemetry.batteryPct ?? null,
            uplinkCounter: latestTelemetry.uplinkCounter ?? null,
          })
        : null,
    },
  });
});

devicesRouter.post("/:id/control/light", async (req, res) => {
  const userId = req.user!.id;
  const deviceId = req.params.id;
  const { on } = (req.body ?? {}) as { on?: unknown };

  if (typeof on !== "boolean") {
    return res.status(400).json({ error: "Invalid on" });
  }

  const device = await prisma.device.findFirst({
    where: { id: deviceId, userId },
    select: {
      id: true,
      deviceUid: true,
      type: true,
      status: true,
    },
  });

  if (!device) return res.status(404).json({ error: "Device not found" });

  if (!isLightDevice(device.type)) {
    return res.status(400).json({ error: "Device is not Light" });
  }

  if (device.status === DeviceStatus.OFFLINE) {
    return res.status(400).json({ error: "Device is offline" });
  }

  let commandLog: Awaited<ReturnType<typeof publishDeviceCommand>> | null =
    null;

  try {
    commandLog = await publishDeviceCommand(
      device.deviceUid,
      {
        type: "light:set",
        on,
      },
      {
        deviceId: device.id,
        userId,
      },
    );
  } catch {
    return res.status(503).json({ error: "MQTT unavailable" });
  }

  await prisma.device.update({
    where: { id: device.id },
    data: { lightOn: on },
    select: { id: true },
  });

  emitRuntimeUpdate(userId, {
    deviceId: device.id,
    lightOn: on,
  });

  return res.status(200).json({
    ok: true,
    device: {
      id: device.id,
      lightOn: on,
    },
    command: commandLog
      ? {
          id: commandLog.id,
          status: commandLog.status,
        }
      : null,
    message: "Light command sent.",
  });
});

devicesRouter.post("/:id/control/ac", async (req, res) => {
  const userId = req.user!.id;
  const deviceId = req.params.id;
  const { on, targetTempC } = (req.body ?? {}) as {
    on?: unknown;
    targetTempC?: unknown;
  };

  const hasOn = typeof on === "boolean";
  const hasTarget =
    typeof targetTempC === "number" && Number.isFinite(targetTempC);

  if (!hasOn && !hasTarget) {
    return res.status(400).json({ error: "Missing on or targetTempC" });
  }

  if (hasTarget && (targetTempC < 16 || targetTempC > 30)) {
    return res
      .status(400)
      .json({ error: "targetTempC must be between 16 and 30" });
  }

  const device = await prisma.device.findFirst({
    where: { id: deviceId, userId },
    select: {
      id: true,
      deviceUid: true,
      type: true,
      status: true,
    },
  });

  if (!device) return res.status(404).json({ error: "Device not found" });

  if (!isAirConditionerDevice(device.type)) {
    return res.status(400).json({ error: "Device is not Air Conditioner" });
  }

  if (device.status === DeviceStatus.OFFLINE) {
    return res.status(400).json({ error: "Device is offline" });
  }

  const command: Record<string, unknown> = { type: "ac:set" };

  if (hasOn) command.on = on;
  if (hasTarget) command.targetTempC = Math.round(targetTempC as number);

  let commandLog: Awaited<ReturnType<typeof publishDeviceCommand>> | null =
    null;

  try {
    commandLog = await publishDeviceCommand(device.deviceUid, command, {
      deviceId: device.id,
      userId,
    });
  } catch {
    return res.status(503).json({ error: "MQTT unavailable" });
  }

  const runtimePatch: {
    acOn?: boolean;
    acTargetTempC?: number;
  } = {};

  if (hasOn) runtimePatch.acOn = on as boolean;
  if (hasTarget) runtimePatch.acTargetTempC = Math.round(targetTempC as number);

  await prisma.device.update({
    where: { id: device.id },
    data: runtimePatch,
    select: { id: true },
  });

  emitRuntimeUpdate(userId, {
    deviceId: device.id,
    ...runtimePatch,
  });

  return res.status(200).json({
    ok: true,
    device: {
      id: device.id,
      ...runtimePatch,
    },
    command: commandLog
      ? {
          id: commandLog.id,
          status: commandLog.status,
        }
      : null,
    message: "Air conditioner command sent.",
  });
});

devicesRouter.post("/:id/control/lpwan", async (req, res) => {
  const userId = req.user!.id;
  const deviceId = req.params.id;
  const { enabled } = (req.body ?? {}) as { enabled?: unknown };

  if (typeof enabled !== "boolean") {
    return res.status(400).json({ error: "Invalid enabled" });
  }

  const device = await prisma.device.findFirst({
    where: {
      id: deviceId,
      userId,
      connectionType: ConnectionType.LPWAN,
    },
    select: {
      id: true,
      devEui: true,
      connectionType: true,
    },
  });

  if (!device) {
    return res.status(404).json({ error: "LPWAN device not found" });
  }

  if (!device.devEui) {
    return res.status(400).json({ error: "LPWAN device missing devEui" });
  }

  const updated = await prisma.device.update({
    where: { id: device.id },
    data: {
      isEnabled: enabled,
      status: DeviceStatus.OFFLINE,
      ...(enabled
        ? { lastUplinkCounter: null }
        : { lastSeenAt: null }),
    },
    select: {
      ...baseDeviceSelect,
      telemetry: {
        orderBy: { ts: "desc" },
        take: 1,
        select: telemetrySelect,
      },
    },
  });

  let downlinkSent = false;
  let downlinkError: string | undefined;

  try {
    await publishLpwanDownlink(
      device.devEui,
      {
        type: "lpwan:set",
        enabled,
      },
      {
        qos: 1,
        retain: true,
      },
    );

    downlinkSent = true;
  } catch (err) {
    downlinkError =
      err instanceof Error ? err.message : "MQTT downlink unavailable";
    console.warn(
      `Could not publish LPWAN ${enabled ? "enable" : "disable"} downlink for ${device.devEui}: ${downlinkError}`,
    );
  }

  const latestTelemetry = updated.telemetry[0] ?? null;
  const { telemetry, userId: _userId, ...deviceWithoutTelemetry } = updated;

  return res.status(200).json({
    ok: true,
    device: {
      ...deviceWithoutTelemetry,
      lastSeenAt: updated.lastSeenAt ?? latestTelemetry?.ts ?? null,
      latestTelemetry: latestTelemetry
        ? mapTelemetry({
            ...latestTelemetry,
            signalDbm: latestTelemetry.signalDbm ?? null,
            rssi: latestTelemetry.rssi ?? null,
            snr: latestTelemetry.snr ?? null,
            spreadingFactor: latestTelemetry.spreadingFactor ?? null,
            batteryPct: latestTelemetry.batteryPct ?? null,
            uplinkCounter: latestTelemetry.uplinkCounter ?? null,
          })
        : null,
    },
    message: enabled
      ? downlinkSent
        ? "LPWAN device enabled. Waiting for next uplink."
        : "LPWAN device enabled in backend. Downlink could not be sent; check MQTT broker or simulator."
      : downlinkSent
        ? "LPWAN device disabled."
        : "LPWAN device disabled in backend. Downlink could not be sent; backend will ignore uplinks until enabled again.",
    downlinkSent,
    ...(downlinkError ? { downlinkError } : {}),
  });
});

devicesRouter.delete("/:id", async (req, res) => {
  const userId = req.user!.id;
  const id = req.params.id;

  const existing = await prisma.device.findFirst({
    where: { id, userId },
    select: {
      id: true,
      deviceUid: true,
      devEui: true,
      connectionType: true,
    },
  });

  if (!existing) return res.status(404).json({ error: "Device not found" });

  if (existing.connectionType === ConnectionType.LPWAN) {
    await disableLpwanVirtualDevice(existing.devEui);
  } else {
    await disableStandardVirtualDevice(existing.deviceUid);
  }

  await prisma.device.update({
    where: { id: existing.id },
    data: {
      userId: null,
      isEnabled: false,
      joinStatus: DeviceJoinStatus.UNCLAIMED,
      status: DeviceStatus.OFFLINE,
      lastSeenAt: null,
    },
    select: { id: true },
  });

  return res.status(204).send();
});
