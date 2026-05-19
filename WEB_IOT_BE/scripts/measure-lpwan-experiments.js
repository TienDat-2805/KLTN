const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { performance } = require("node:perf_hooks");

const ROOT = path.resolve(__dirname, "..", "..");
const BE_ROOT = path.join(ROOT, "WEB_IOT_BE");
const FE_ROOT = path.join(ROOT, "WEB_IOT_FE");
const OUTPUT_MD = path.join(ROOT, "SO_LIEU_THUC_NGHIEM_LPWAN.md");

require(path.join(BE_ROOT, "node_modules", "dotenv")).config({
  path: path.join(BE_ROOT, ".env"),
});

const jwt = require(path.join(BE_ROOT, "node_modules", "jsonwebtoken"));
const { io } = require(path.join(FE_ROOT, "node_modules", "socket.io-client"));
const {
  PrismaClient,
  ConnectionType,
  DeviceJoinStatus,
  DeviceStatus,
  NetworkType,
} = require(path.join(BE_ROOT, "node_modules", "@prisma", "client"));

const { createApp } = require(path.join(BE_ROOT, "dist", "app"));
const { handleLpwanUplink } = require(path.join(BE_ROOT, "dist", "lpwan", "uplink"));
const { initIO, closeIO } = require(path.join(BE_ROOT, "dist", "realtime", "io"));

const prisma = new PrismaClient();

const JWT_SECRET = process.env.JWT_ACCESS_SECRET || "dev_secret_123456";
const EXP_EMAIL = "lpwan-experiment@example.com";
const EXP_PREFIX = "EXP_LPWAN_";
const LATENCY_UPLINKS_PER_DEVICE = Number(
  process.env.EXP_LPWAN_UPLINKS_PER_DEVICE || 30,
);
const LATENCY_DEVICE_COUNTS = (process.env.EXP_LPWAN_DEVICE_COUNTS || "1,10,50,100")
  .split(",")
  .map((v) => Number(v.trim()))
  .filter((v) => Number.isInteger(v) && v > 0);
const DETECTION_PACKET_COUNT = Number(
  process.env.EXP_LPWAN_DETECTION_PACKET_COUNT || 100,
);
const BATCH_SIZE = Number(process.env.EXP_LPWAN_BATCH_SIZE || 25);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

async function startMeasurementServer() {
  const app = createApp();
  const server = http.createServer(app);
  initIO(server);
  const port = await listen(server);
  return {
    server,
    url: `http://127.0.0.1:${port}`,
  };
}

async function upsertExperimentUser() {
  return prisma.user.upsert({
    where: { email: EXP_EMAIL },
    update: { fullName: "LPWAN Experiment User" },
    create: {
      email: EXP_EMAIL,
      fullName: "LPWAN Experiment User",
      passwordHash: "not-used-for-experiment",
    },
  });
}

async function cleanupPreviousExperimentData(userId) {
  const devices = await prisma.device.findMany({
    where: {
      OR: [
        { deviceUid: { startsWith: EXP_PREFIX } },
        { userId, model: "LPWAN-EXP" },
      ],
    },
    select: { id: true },
  });

  const deviceIds = devices.map((d) => d.id);
  if (deviceIds.length) {
    await prisma.telemetry.deleteMany({ where: { deviceId: { in: deviceIds } } });
    await prisma.deviceAlert.deleteMany({ where: { deviceId: { in: deviceIds } } });
    await prisma.deviceCommand.deleteMany({ where: { deviceId: { in: deviceIds } } });
    await prisma.device.deleteMany({ where: { id: { in: deviceIds } } });
  }

  await prisma.deviceAlert.deleteMany({
    where: {
      userId,
      OR: [
        { type: "DUPLICATE_UPLINK" },
        { type: "REPLAY_UPLINK" },
        { type: "LPWAN_WARNING" },
      ],
    },
  });
}

function makeDevEui(group, index) {
  const g = Number(group).toString(16).padStart(2, "0").slice(-2);
  const i = Number(index).toString(16).padStart(6, "0").slice(-6);
  return `70B3D57E${g}${i}`.toUpperCase();
}

function shortId(value) {
  return value.slice(-8);
}

async function createExperimentDevice(userId, devEui, name) {
  const suffix = shortId(devEui);
  return prisma.device.upsert({
    where: { devEui },
    update: {
      userId,
      name,
      type: "Temperature",
      model: "LPWAN-EXP",
      connectionType: ConnectionType.LPWAN,
      networkType: NetworkType.LORAWAN,
      joinStatus: DeviceJoinStatus.CLAIMED,
      isEnabled: true,
      status: DeviceStatus.OFFLINE,
      lastSeenAt: null,
      lastJoinAt: null,
      gatewayId: null,
      lastRssi: null,
      lastSnr: null,
      lastSpreadingFactor: null,
      lastBatteryPct: null,
      lastUplinkCounter: null,
    },
    create: {
      deviceUid: `${EXP_PREFIX}${suffix}`,
      activationCode: `EXP-${suffix}`,
      userId,
      name,
      type: "Temperature",
      model: "LPWAN-EXP",
      connectionType: ConnectionType.LPWAN,
      networkType: NetworkType.LORAWAN,
      joinStatus: DeviceJoinStatus.CLAIMED,
      isEnabled: true,
      status: DeviceStatus.OFFLINE,
      devEui,
    },
  });
}

async function resetDevice(deviceId) {
  await prisma.telemetry.deleteMany({ where: { deviceId } });
  await prisma.deviceAlert.deleteMany({ where: { deviceId } });
  await prisma.device.update({
    where: { id: deviceId },
    data: {
      isEnabled: true,
      status: DeviceStatus.OFFLINE,
      lastSeenAt: null,
      lastJoinAt: null,
      lastRssi: null,
      lastSnr: null,
      lastSpreadingFactor: null,
      lastBatteryPct: null,
      lastUplinkCounter: null,
    },
  });
}

function makeUplink(devEui, fCnt, patch = {}) {
  return {
    devEui,
    gatewayId: patch.gatewayId || "GW-EXP-01",
    networkType: "LORAWAN",
    rssi: patch.rssi ?? -88,
    snr: patch.snr ?? 7,
    spreadingFactor: patch.spreadingFactor ?? 8,
    fCnt,
    ts: new Date().toISOString(),
    payload: {
      temperatureC: patch.temperatureC ?? 24,
      humidityPct: patch.humidityPct ?? 55,
      batteryPct: patch.batteryPct ?? 85,
    },
  };
}

function connectSocket(baseUrl, token) {
  return new Promise((resolve, reject) => {
    const socket = io(baseUrl, {
      auth: { token },
      transports: ["websocket", "polling"],
      reconnection: false,
    });

    const timer = setTimeout(() => {
      socket.close();
      reject(new Error("Socket.IO connection timeout"));
    }, 10000);

    socket.once("connect_error", (err) => {
      clearTimeout(timer);
      socket.close();
      reject(err);
    });

    socket.once("hello", () => {
      clearTimeout(timer);
      resolve(socket);
    });
  });
}

function stats(values) {
  if (!values.length) {
    return { count: 0, avg: 0, std: 0, min: 0, max: 0, p95: 0 };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance =
    values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / values.length;
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];

  return {
    count: values.length,
    avg,
    std: Math.sqrt(variance),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    p95,
  };
}

function fmt(value, digits = 2) {
  return Number(value).toFixed(digits);
}

async function runInBatches(items, size, fn) {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(fn));
  }
}

async function runLatencyExperiment({ userId, socket }) {
  const pending = new Map();
  const latencies = [];
  let timeoutCount = 0;

  function onTelemetry(payload) {
    const key = `${payload.deviceId}:${payload.uplinkCounter}`;
    const item = pending.get(key);
    if (!item) return;
    clearTimeout(item.timer);
    pending.delete(key);
    latencies.push(performance.now() - item.startedAt);
    item.resolve();
  }

  socket.on("telemetry:new", onTelemetry);

  function waitTelemetry(deviceId, counter, startedAt) {
    const key = `${deviceId}:${counter}`;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        timeoutCount += 1;
        pending.delete(key);
        resolve();
      }, 10000);
      pending.set(key, { startedAt, resolve, timer });
    });
  }

  const results = [];

  for (const deviceCount of LATENCY_DEVICE_COUNTS) {
    console.log(
      `Latency scenario: ${deviceCount} devices x ${LATENCY_UPLINKS_PER_DEVICE} uplinks`,
    );
    latencies.length = 0;
    timeoutCount = 0;
    pending.clear();

    const devices = [];
    for (let i = 0; i < deviceCount; i += 1) {
      const devEui = makeDevEui(deviceCount, i + 1);
      const device = await createExperimentDevice(
        userId,
        devEui,
        `EXP latency ${deviceCount}-${i + 1}`,
      );
      await resetDevice(device.id);
      devices.push(device);
    }

    for (let round = 1; round <= LATENCY_UPLINKS_PER_DEVICE; round += 1) {
      await runInBatches(devices, BATCH_SIZE, async (device, index) => {
        const startedAt = performance.now();
        const wait = waitTelemetry(device.id, round, startedAt);
        await handleLpwanUplink(
          device.devEui,
          makeUplink(device.devEui, round, {
            temperatureC: 22 + (index % 5),
            humidityPct: 50 + (round % 10),
            batteryPct: 82 + (index % 10),
            rssi: -84 - (index % 18),
            snr: 7 - (index % 4),
            spreadingFactor: 7 + (index % 4),
          }),
        );
        await wait;
      });
    }

    const total = deviceCount * LATENCY_UPLINKS_PER_DEVICE;
    const s = stats(latencies);
    results.push({
      deviceCount,
      uplinksPerDevice: LATENCY_UPLINKS_PER_DEVICE,
      totalUplinks: total,
      receivedEvents: s.count,
      timeoutCount,
      avg: s.avg,
      std: s.std,
      min: s.min,
      max: s.max,
      p95: s.p95,
      successRate: total ? (s.count / total) * 100 : 0,
    });
  }

  socket.off("telemetry:new", onTelemetry);
  return results;
}

async function runDetectionExperiment({ userId }) {
  console.log(`Duplicate/replay scenario: ${DETECTION_PACKET_COUNT} packets per group`);
  const devEui = makeDevEui(201, 1);
  const device = await createExperimentDevice(
    userId,
    devEui,
    "EXP duplicate/replay validation",
  );
  await resetDevice(device.id);

  for (let counter = 1; counter <= DETECTION_PACKET_COUNT; counter += 1) {
    await handleLpwanUplink(
      devEui,
      makeUplink(devEui, counter, {
        rssi: -82,
        snr: 8,
        spreadingFactor: 7,
        batteryPct: 90,
      }),
    );
  }

  const telemetryAfterValid = await prisma.telemetry.count({
    where: { deviceId: device.id },
  });

  for (let i = 0; i < DETECTION_PACKET_COUNT; i += 1) {
    await handleLpwanUplink(
      devEui,
      makeUplink(devEui, DETECTION_PACKET_COUNT, {
        rssi: -82,
        snr: 8,
        spreadingFactor: 7,
        batteryPct: 90,
      }),
    );
  }

  const telemetryAfterDuplicate = await prisma.telemetry.count({
    where: { deviceId: device.id },
  });
  const duplicateAlerts = await prisma.deviceAlert.count({
    where: { deviceId: device.id, type: "DUPLICATE_UPLINK" },
  });

  const replayCounter = Math.max(1, Math.floor(DETECTION_PACKET_COUNT / 2));
  for (let i = 0; i < DETECTION_PACKET_COUNT; i += 1) {
    await handleLpwanUplink(
      devEui,
      makeUplink(devEui, replayCounter, {
        rssi: -82,
        snr: 8,
        spreadingFactor: 7,
        batteryPct: 90,
      }),
    );
  }

  const telemetryAfterReplay = await prisma.telemetry.count({
    where: { deviceId: device.id },
  });
  const replayAlerts = await prisma.deviceAlert.count({
    where: { deviceId: device.id, type: "REPLAY_UPLINK" },
  });

  return [
    {
      packetType: "Valid",
      sentPackets: DETECTION_PACKET_COUNT,
      correctlyDetected: telemetryAfterValid,
      detectionRate: (telemetryAfterValid / DETECTION_PACKET_COUNT) * 100,
      telemetrySaved: telemetryAfterValid,
      alertsGenerated: 0,
      note: "Telemetry is stored",
    },
    {
      packetType: "Duplicate",
      sentPackets: DETECTION_PACKET_COUNT,
      correctlyDetected: duplicateAlerts,
      detectionRate: (duplicateAlerts / DETECTION_PACKET_COUNT) * 100,
      telemetrySaved: telemetryAfterDuplicate - telemetryAfterValid,
      alertsGenerated: duplicateAlerts,
      note: "Telemetry is ignored, alert is created",
    },
    {
      packetType: "Replay",
      sentPackets: DETECTION_PACKET_COUNT,
      correctlyDetected: replayAlerts,
      detectionRate: (replayAlerts / DETECTION_PACKET_COUNT) * 100,
      telemetrySaved: telemetryAfterReplay - telemetryAfterDuplicate,
      alertsGenerated: replayAlerts,
      note: "Telemetry is ignored, alert is created",
    },
  ];
}

async function getHealth(baseUrl, deviceId, token) {
  const res = await fetch(`${baseUrl}/devices/${deviceId}/lpwan-health`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Health API failed with HTTP ${res.status}`);
  return res.json();
}

async function runHealthExperiment({ userId, baseUrl, token }) {
  console.log("Health score scenario");
  const scenarios = [
    {
      scenario: "Good signal",
      rssi: -80,
      snr: 8,
      batteryPct: 90,
      spreadingFactor: 7,
    },
    {
      scenario: "Medium signal",
      rssi: -110,
      snr: -2,
      batteryPct: 30,
      spreadingFactor: 11,
    },
    {
      scenario: "Weak signal",
      rssi: -116,
      snr: -3,
      batteryPct: 25,
      spreadingFactor: 11,
    },
    {
      scenario: "Critical",
      rssi: -123,
      snr: -12,
      batteryPct: 5,
      spreadingFactor: 12,
    },
  ];

  const results = [];
  for (let i = 0; i < scenarios.length; i += 1) {
    const sc = scenarios[i];
    const devEui = makeDevEui(220, i + 1);
    const device = await createExperimentDevice(
      userId,
      devEui,
      `EXP health ${sc.scenario}`,
    );
    await resetDevice(device.id);
    await handleLpwanUplink(
      devEui,
      makeUplink(devEui, 1, {
        rssi: sc.rssi,
        snr: sc.snr,
        spreadingFactor: sc.spreadingFactor,
        batteryPct: sc.batteryPct,
        temperatureC: 24,
        humidityPct: 55,
      }),
    );
    const data = await getHealth(baseUrl, device.id, token);
    results.push({
      ...sc,
      score: data.health.score,
      level: data.health.level,
      summary: data.health.summary,
    });
  }

  return results;
}

function markdownReport({ generatedAt, baseUrl, latencyResults, detectionResults, healthResults }) {
  const lines = [];
  lines.push("# SO LIEU THUC NGHIEM LPWAN");
  lines.push("");
  lines.push(`Generated at: ${generatedAt}`);
  lines.push("");
  lines.push("This file contains measured data for thesis Sections/Tables 5.3, 5.4, and 5.5.");
  lines.push("The measurement uses the real backend LPWAN processing function, Prisma/PostgreSQL, and Socket.IO event delivery. MQTT transport is bypassed to avoid local ambiguity caused by multiple MQTT proxies on port 1883; the measured path starts at the backend LPWAN handler after an MQTT message has been received.");
  lines.push("");
  lines.push("## Table 5.1 / Section 5.3 - Backend LPWAN uplink processing latency to Socket.IO event");
  lines.push("");
  lines.push("| Devices | Uplinks/device | Total uplinks | Socket events | Timeout | Success rate (%) | Avg latency (ms) | Std dev (ms) | P95 (ms) | Max (ms) |");
  lines.push("| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const row of latencyResults) {
    lines.push(
      `| ${row.deviceCount} | ${row.uplinksPerDevice} | ${row.totalUplinks} | ${row.receivedEvents} | ${row.timeoutCount} | ${fmt(row.successRate)} | ${fmt(row.avg)} | ${fmt(row.std)} | ${fmt(row.p95)} | ${fmt(row.max)} |`,
    );
  }
  lines.push("");
  lines.push("CSV:");
  lines.push("");
  lines.push("```csv");
  lines.push("devices,uplinks_per_device,total_uplinks,socket_events,timeout,success_rate_pct,avg_latency_ms,std_dev_ms,p95_ms,max_ms");
  for (const row of latencyResults) {
    lines.push(
      `${row.deviceCount},${row.uplinksPerDevice},${row.totalUplinks},${row.receivedEvents},${row.timeoutCount},${fmt(row.successRate)},${fmt(row.avg)},${fmt(row.std)},${fmt(row.p95)},${fmt(row.max)}`,
    );
  }
  lines.push("```");
  lines.push("");
  lines.push("## Table 5.2 / Section 5.4 - Duplicate/replay detection");
  lines.push("");
  lines.push("| Packet type | Sent packets | Correctly detected | Detection rate (%) | Telemetry saved | Alerts generated | Note |");
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: | --- |");
  for (const row of detectionResults) {
    lines.push(
      `| ${row.packetType} | ${row.sentPackets} | ${row.correctlyDetected} | ${fmt(row.detectionRate)} | ${row.telemetrySaved} | ${row.alertsGenerated} | ${row.note} |`,
    );
  }
  lines.push("");
  lines.push("CSV:");
  lines.push("");
  lines.push("```csv");
  lines.push("packet_type,sent_packets,correctly_detected,detection_rate_pct,telemetry_saved,alerts_generated,note");
  for (const row of detectionResults) {
    lines.push(
      `${row.packetType},${row.sentPackets},${row.correctlyDetected},${fmt(row.detectionRate)},${row.telemetrySaved},${row.alertsGenerated},${row.note}`,
    );
  }
  lines.push("```");
  lines.push("");
  lines.push("## Table 5.3 / Section 5.5 - LPWAN health score distribution");
  lines.push("");
  lines.push("| Scenario | RSSI | SNR | Battery | SF | Score | Level |");
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: | --- |");
  for (const row of healthResults) {
    lines.push(
      `| ${row.scenario} | ${row.rssi} dBm | ${row.snr} dB | ${row.batteryPct}% | ${row.spreadingFactor} | ${row.score} | ${row.level} |`,
    );
  }
  lines.push("");
  lines.push("CSV:");
  lines.push("");
  lines.push("```csv");
  lines.push("scenario,rssi_dbm,snr_db,battery_pct,sf,score,level");
  for (const row of healthResults) {
    lines.push(
      `${row.scenario},${row.rssi},${row.snr},${row.batteryPct},${row.spreadingFactor},${row.score},${row.level}`,
    );
  }
  lines.push("```");
  lines.push("");
  lines.push("## Measurement notes");
  lines.push("");
  lines.push(`- Measurement server URL: ${baseUrl}`);
  lines.push(`- Latency uplinks per device: ${LATENCY_UPLINKS_PER_DEVICE}`);
  lines.push(`- Duplicate/replay packets per group: ${DETECTION_PACKET_COUNT}`);
  lines.push(`- Batch size for latency test: ${BATCH_SIZE}`);
  lines.push("- Latency is measured from the call to `handleLpwanUplink()` to the matching `telemetry:new` Socket.IO event.");
  lines.push("- Duplicate/replay detection is validated through database counts in `telemetry` and `device_alerts`.");
  lines.push("- Health score values are retrieved from `GET /devices/:id/lpwan-health` after publishing one uplink for each radio condition scenario.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function main() {
  const server = await startMeasurementServer();
  const user = await upsertExperimentUser();
  console.log("Cleaning previous experiment data");
  await cleanupPreviousExperimentData(user.id);

  const token = jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, {
    expiresIn: "2h",
  });
  const socket = await connectSocket(server.url, token);

  try {
    console.log("Starting LPWAN measurements");
    const latencyResults = await runLatencyExperiment({
      userId: user.id,
      socket,
    });

    const detectionResults = await runDetectionExperiment({
      userId: user.id,
    });

    const healthResults = await runHealthExperiment({
      userId: user.id,
      baseUrl: server.url,
      token,
    });

    const generatedAt = new Date().toISOString();
    fs.writeFileSync(
      OUTPUT_MD,
      markdownReport({
        generatedAt,
        baseUrl: server.url,
        latencyResults,
        detectionResults,
        healthResults,
      }),
      "utf8",
    );

    console.log(`Wrote ${OUTPUT_MD}`);
  } finally {
    socket.close();
    await closeIO();
    await closeServer(server.server);
    await prisma.$disconnect();
  }
}

main().catch(async (err) => {
  console.error(err);
  await closeIO().catch(() => {});
  await prisma.$disconnect().catch(() => {});
  process.exitCode = 1;
});
