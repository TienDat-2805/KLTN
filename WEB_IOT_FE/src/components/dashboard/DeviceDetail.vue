<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

import Chart from "chart.js/auto";

import {
  ArrowLeftIcon,
  ClockIcon,
  CpuChipIcon,
} from "@heroicons/vue/24/outline";

import {
  useDeviceStore,
  type CameraFramePoint,
  type Device,
  type RuntimePoint,
  type TelemetryPoint,
} from "../../store/deviceStore";
import { apiRequest } from "../../lib/api";
import { useAuthStore } from "../../store/authStore";

const store = useDeviceStore();
const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

const deviceId = computed(() => String(route.params.id ?? ""));

const loading = ref(false);

type TelemetryRange = "realtime" | "15m" | "1h" | "24h";

const telemetryRanges: TelemetryRange[] = ["realtime", "15m", "1h", "24h"];

type DeviceCommand = {
  id: string;
  deviceId: string | null;
  deviceUid: string;
  topic: string;
  type: string;
  payload: unknown;
  status: "PENDING" | "SENT" | "ACKED" | "FAILED" | "TIMEOUT";
  error?: string | null;
  ackPayload?: unknown;
  sentAt?: string | null;
  ackAt?: string | null;
  timedOutAt?: string | null;
  createdAt: string;
};

type DeviceAlert = {
  id: string;
  deviceId: string | null;
  type: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  title: string;
  message: string;
  metadata?: unknown;
  isRead: boolean;
  readAt?: string | null;
  createdAt: string;
};

type LpwanHealthCheck = {
  key: string;
  label: string;
  status: "GOOD" | "FAIR" | "POOR" | "CRITICAL" | "UNKNOWN";
  value: string;
  detail: string;
};

type LpwanHealth = {
  score: number;
  level: "GOOD" | "FAIR" | "POOR" | "CRITICAL";
  summary: string;
  calculatedAt: string;
  radio: {
    devEui?: string | null;
    gatewayId?: string | null;
    networkType?: string | null;
    lastJoinAt?: string | null;
    lastSeenAt?: string | null;
    lastRssi?: number | null;
    lastSnr?: number | null;
    lastSpreadingFactor?: number | null;
    lastBatteryPct?: number | null;
    lastUplinkCounter?: number | null;
  };
  checks: LpwanHealthCheck[];
};

const historyLoading = ref(false);
const commandLoading = ref(false);
const alertLoading = ref(false);
const lpwanHealthLoading = ref(false);
const telemetryRange = ref<TelemetryRange>("1h");
const telemetryHistory = ref<TelemetryPoint[]>([]);
const commandHistory = ref<DeviceCommand[]>([]);
const alertHistory = ref<DeviceAlert[]>([]);
const lpwanHealth = ref<LpwanHealth | null>(null);
const detailError = ref<string | null>(null);
const telemetryError = ref<string | null>(null);
const commandError = ref<string | null>(null);
const alertError = ref<string | null>(null);
const lpwanHealthError = ref<string | null>(null);

const device = computed<Device | null>(() => {
  return store.devices.find((d) => d.id === deviceId.value) ?? null;
});

function connectionLabel(
  deviceUid: string | undefined,
  model: string | undefined,
) {
  const uid = (deviceUid ?? "").toLowerCase();
  const m = (model ?? "").toLowerCase();

  if (m.includes("eth") || m.includes("ethernet") || uid.includes("eth"))
    return "Wired";
  if (m.includes("wifi") || uid.includes("wifi")) return "Wi-Fi";
  if (uid.includes("lpwan") || m.includes("lora") || m.includes("lpwan"))
    return "LPWAN";

  return "—";
}

const connection = computed(() =>
  connectionLabel(device.value?.deviceUid, device.value?.model),
);

const lastActivityLabel = computed(() => {
  if (!device.value) return "—";
  return store.getLastUpdateLabel(device.value);
});

const powerW = computed(() => {
  const d = device.value;
  if (!d) return null;

  const uid = (d.deviceUid ?? "").trim().toUpperCase();
  const type = (d.type ?? "").toLowerCase();

  if (type.includes("air") || type.includes("ac")) return d.acOn ? 1200 : 0;
  if (type.includes("light")) return d.lightOn ? 9 : 0;

  if (uid === "WIFI_001") return 0.8;
  if (uid === "CAMERA_ETH_001") return 6;
  if (uid === "LPWAN_001") return 0.2;
  if (uid.startsWith("LPWAN_")) return 0.2;

  if (type.includes("camera") || type.includes("cam")) return 6;
  if (type.includes("humid")) return 0.8;
  if (type.includes("temp") || type.includes("thermo")) return 0.2;

  return null;
});

const latestTelemetry = computed<TelemetryPoint | null>(
  () => device.value?.latestTelemetry ?? null,
);

const isLpwanDevice = computed(() => {
  const d = device.value;
  if (!d) return false;

  return (
    d.connectionType === "LPWAN" ||
    Boolean(d.devEui) ||
    (d.deviceUid ?? "").toUpperCase().startsWith("LPWAN_")
  );
});

const lpwanUplinkEnabled = computed(() => {
  const d = device.value;
  if (!d) return false;

  return store.lpwanUplinkEnabledByDeviceId[d.id] ?? d.status !== "OFFLINE";
});

const lpwanControlBusy = computed(() => {
  const d = device.value;
  if (!d) return false;

  return store.isLpwanBusy(d.id);
});

type DeviceKind =
  | "temperature"
  | "humidity"
  | "light"
  | "ac"
  | "camera"
  | "generic";

const deviceKind = computed<DeviceKind>(() => {
  const d = device.value;
  if (!d) return "generic";

  const t = (d.type ?? "").toLowerCase();
  const m = (d.model ?? "").toLowerCase();
  const s = `${t} ${m}`;

  if (s.includes("camera") || s.includes("cam")) return "camera";
  if (s.includes("light") || s.includes("lamp")) return "light";
  if (s.includes("air") || s.includes("ac") || s.includes("condition"))
    return "ac";
  if (s.includes("humid")) return "humidity";
  if (s.includes("temp") || s.includes("thermo")) return "temperature";

  return "generic";
});

const isSensorDevice = computed(() => {
  return (
    deviceKind.value === "temperature" ||
    deviceKind.value === "humidity" ||
    deviceKind.value === "generic"
  );
});

const windowPoints = computed<TelemetryPoint[]>(() => {
  if (!device.value) return [];
  return store.getTelemetryWindow(device.value.id);
});

const chartPoints = computed<TelemetryPoint[]>(() => {
  if (telemetryRange.value === "realtime") return windowPoints.value;
  return telemetryHistory.value;
});

const runtimePoints = computed<RuntimePoint[]>(() => {
  if (!device.value) return [];
  return store.getRuntimeWindow(device.value.id);
});

const cameraFrames = computed<CameraFramePoint[]>(() => {
  if (!device.value) return [];
  return store.getCameraFrameWindow(device.value.id);
});

const cameraFrameRows = computed(() => {
  return [...cameraFrames.value]
    .sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))
    .slice(0, 30);
});

const telemetryRows = computed(() => {
  return [...chartPoints.value]
    .sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))
    .slice(0, 30);
});

const normalizedRuntimeAsc = computed(() => {
  const d = device.value;

  if (!d) {
    return [] as Array<
      RuntimePoint & {
        lightOn?: boolean;
        acOn?: boolean;
        acTargetTempC?: number;
      }
    >;
  }

  const points = [...runtimePoints.value].sort(
    (a, b) => Date.parse(a.ts) - Date.parse(b.ts),
  );

  let lightOn = d.lightOn;
  let acOn = d.acOn;
  let acTargetTempC = d.acTargetTempC;

  return points.map((p) => {
    if (typeof p.lightOn === "boolean") lightOn = p.lightOn;
    if (typeof p.acOn === "boolean") acOn = p.acOn;
    if (typeof p.acTargetTempC === "number") acTargetTempC = p.acTargetTempC;

    return {
      ...p,
      lightOn,
      acOn,
      acTargetTempC,
    };
  });
});

const runtimeRows = computed(() => {
  return [...normalizedRuntimeAsc.value]
    .sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))
    .slice(0, 30);
});

const latestActivityCards = computed(() => {
  const d = device.value;

  if (!d) return [] as Array<{ label: string; value: string; unit?: string }>;

  const kind = deviceKind.value;

  if (kind === "temperature") {
    return [
      {
        label: "Temperature",
        value: fmtNumber(latestTelemetry.value?.temperatureC, 2),
        unit: "°C",
      },
      {
        label: "Signal",
        value: fmtNumber(latestTelemetry.value?.signalDbm ?? null, 0),
        unit: "dBm",
      },
    ];
  }

  if (kind === "humidity") {
    return [
      {
        label: "Humidity",
        value: fmtNumber(latestTelemetry.value?.humidityPct, 2),
        unit: "%",
      },
      {
        label: "Signal",
        value: fmtNumber(latestTelemetry.value?.signalDbm ?? null, 0),
        unit: "dBm",
      },
    ];
  }

  if (kind === "light") {
    const status =
      typeof d.lightOn === "boolean" ? (d.lightOn ? "ON" : "OFF") : "—";
    return [{ label: "Light status", value: status }];
  }

  if (kind === "ac") {
    const status = typeof d.acOn === "boolean" ? (d.acOn ? "ON" : "OFF") : "—";
    const target =
      typeof d.acTargetTempC === "number"
        ? `${Math.round(d.acTargetTempC)}°C`
        : "—";

    return [
      { label: "AC status", value: status },
      { label: "Target temperature", value: target },
    ];
  }

  if (kind === "camera") {
    return [{ label: "Frame", value: d.cameraFrameUrl ? "RECEIVED" : "—" }];
  }

  return [
    {
      label: "Temperature",
      value: fmtNumber(latestTelemetry.value?.temperatureC, 2),
      unit: "°C",
    },
    {
      label: "Humidity",
      value: fmtNumber(latestTelemetry.value?.humidityPct, 2),
      unit: "%",
    },
    {
      label: "Signal",
      value: fmtNumber(latestTelemetry.value?.signalDbm ?? null, 0),
      unit: "dBm",
    },
  ];
});

const latestActivityTs = computed(() => {
  const kind = deviceKind.value;

  if (kind === "light" || kind === "ac") {
    const last =
      normalizedRuntimeAsc.value[normalizedRuntimeAsc.value.length - 1];
    return last?.ts ?? latestTelemetry.value?.ts ?? null;
  }

  if (kind === "camera") {
    return cameraFrameRows.value[0]?.ts ?? device.value?.lastSeenAt ?? null;
  }

  return latestTelemetry.value?.ts ?? null;
});

const activityCount = computed(() => {
  const kind = deviceKind.value;

  if (kind === "light" || kind === "ac") return runtimeRows.value.length;
  if (kind === "camera") return cameraFrameRows.value.length;

  return telemetryRows.value.length;
});

const unreadAlertCount = computed(() => {
  return alertHistory.value.filter((a) => !a.isRead).length;
});

const activityTitle = computed(() => {
  if (deviceKind.value === "camera") return "Camera frame activity";
  if (deviceKind.value === "light") return "Light runtime activity";
  if (deviceKind.value === "ac") return "Air conditioner runtime activity";
  return "Telemetry activity";
});

const activityDescription = computed(() => {
  if (deviceKind.value === "camera") {
    return "Lịch sử các frame camera được backend ghi nhận.";
  }

  if (deviceKind.value === "light") {
    return "Lịch sử trạng thái bật/tắt của thiết bị đèn.";
  }

  if (deviceKind.value === "ac") {
    return "Lịch sử trạng thái điều hòa và nhiệt độ mục tiêu.";
  }

  return "Lịch sử telemetry dạng số theo thời gian.";
});

function statusBadgeClasses(status: Device["status"]) {
  switch (status) {
    case "ONLINE":
      return "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200";
    case "OFFLINE":
      return "bg-red-50 text-red-700 ring-1 ring-inset ring-red-200";
    case "WARNING":
      return "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200";
    default:
      return "bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200";
  }
}

function statusLabel(status: Device["status"]) {
  switch (status) {
    case "ONLINE":
      return "ONLINE";
    case "OFFLINE":
      return "OFFLINE";
    case "WARNING":
      return "WARNING";
    default:
      return status;
  }
}

function fmtNumber(v: number | null | undefined, digits = 2) {
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  return v.toFixed(digits);
}

function loadErrorMessage(prefix: string, err: unknown) {
  const message = err instanceof Error ? err.message : "Request failed";
  return `${prefix}: ${message}`;
}

function rangeLabel(range: TelemetryRange) {
  switch (range) {
    case "realtime":
      return "Realtime";
    case "15m":
      return "15 min";
    case "1h":
      return "1 hour";
    case "24h":
      return "24 hours";
    default:
      return range;
  }
}

function rangeStart(range: TelemetryRange) {
  const now = Date.now();

  switch (range) {
    case "15m":
      return new Date(now - 15 * 60 * 1000);
    case "1h":
      return new Date(now - 60 * 60 * 1000);
    case "24h":
      return new Date(now - 24 * 60 * 60 * 1000);
    default:
      return null;
  }
}

function commandStatusClasses(status: DeviceCommand["status"]) {
  switch (status) {
    case "ACKED":
      return "bg-emerald-50 text-emerald-700 ring-emerald-200";
    case "TIMEOUT":
    case "FAILED":
      return "bg-red-50 text-red-700 ring-red-200";
    case "SENT":
      return "bg-blue-50 text-blue-700 ring-blue-200";
    default:
      return "bg-slate-100 text-slate-700 ring-slate-200";
  }
}

function alertSeverityClasses(severity: DeviceAlert["severity"]) {
  switch (severity) {
    case "CRITICAL":
      return "bg-red-50 text-red-700 ring-red-200";
    case "WARNING":
      return "bg-amber-50 text-amber-700 ring-amber-200";
    default:
      return "bg-blue-50 text-blue-700 ring-blue-200";
  }
}

function lpwanHealthLevelClasses(level: LpwanHealth["level"]) {
  switch (level) {
    case "GOOD":
      return "bg-emerald-50 text-emerald-700 ring-emerald-200";
    case "FAIR":
      return "bg-blue-50 text-blue-700 ring-blue-200";
    case "POOR":
      return "bg-amber-50 text-amber-700 ring-amber-200";
    default:
      return "bg-red-50 text-red-700 ring-red-200";
  }
}

function lpwanCheckClasses(status: LpwanHealthCheck["status"]) {
  switch (status) {
    case "GOOD":
      return "bg-emerald-50 text-emerald-700 ring-emerald-200";
    case "FAIR":
      return "bg-blue-50 text-blue-700 ring-blue-200";
    case "POOR":
      return "bg-amber-50 text-amber-700 ring-amber-200";
    case "CRITICAL":
      return "bg-red-50 text-red-700 ring-red-200";
    default:
      return "bg-slate-100 text-slate-600 ring-slate-200";
  }
}

function lpwanScoreBarClasses(level: LpwanHealth["level"]) {
  switch (level) {
    case "GOOD":
      return "bg-emerald-500";
    case "FAIR":
      return "bg-blue-500";
    case "POOR":
      return "bg-amber-500";
    default:
      return "bg-red-500";
  }
}

function commandActionLabel(cmd: DeviceCommand) {
  const payload = (cmd.payload ?? {}) as Record<string, unknown>;

  switch (cmd.type) {
    case "light:set":
      return payload.on === true
        ? "Turned light on"
        : payload.on === false
          ? "Turned light off"
          : "Updated light";
    case "ac:set": {
      const parts: string[] = [];
      if (payload.on === true) parts.push("turned AC on");
      if (payload.on === false) parts.push("turned AC off");
      if (typeof payload.targetTempC === "number") {
        parts.push(`set target ${Math.round(payload.targetTempC)}°C`);
      }
      return parts.length ? parts.join(", ") : "Updated air conditioner";
    }
    case "device:set":
      return payload.enabled === true
        ? "Enabled device"
        : payload.enabled === false
          ? "Disabled device"
          : "Updated device power";
    default:
      return "Sent device command";
  }
}

function commandResultLabel(cmd: DeviceCommand) {
  switch (cmd.status) {
    case "ACKED":
      return "Completed";
    case "SENT":
      return "Sent";
    case "TIMEOUT":
      return "No response";
    case "FAILED":
      return "Failed";
    default:
      return "Pending";
  }
}

function commandResultNote(cmd: DeviceCommand) {
  if (cmd.status === "ACKED") {
    return cmd.ackAt
      ? `Device confirmed at ${new Date(cmd.ackAt).toLocaleTimeString()}`
      : "Device confirmed the command.";
  }

  if (cmd.status === "SENT") return "Waiting for device confirmation.";
  if (cmd.status === "TIMEOUT") return "The device did not confirm in time.";
  if (cmd.status === "FAILED") return cmd.error || "The command could not be sent.";

  return "Command is queued.";
}

function backToDevices() {
  router.push("/app/devices");
}

async function toggleLpwanUplink() {
  const d = device.value;
  if (!d) return;

  await store.setLpwanEnabled({
    id: d.id,
    enabled: !lpwanUplinkEnabled.value,
  });

  await loadLpwanHealth();
}

async function loadTelemetryHistory() {
  const d = device.value;
  if (!d || !auth.accessToken) return;

  if (telemetryRange.value === "realtime") {
    telemetryHistory.value = [];
    buildChart();
    return;
  }

  const from = rangeStart(telemetryRange.value);
  const params = new URLSearchParams({ limit: "300" });
  if (from) params.set("from", from.toISOString());

  historyLoading.value = true;
  telemetryError.value = null;

  try {
    const data = await apiRequest<{ telemetry: TelemetryPoint[] }>(
      `/devices/${d.id}/telemetry?${params.toString()}`,
      { token: auth.accessToken },
    );

    telemetryHistory.value = data.telemetry ?? [];
  } catch (err) {
    telemetryError.value = loadErrorMessage(
      "Failed to load telemetry history",
      err,
    );
  } finally {
    historyLoading.value = false;
    buildChart();
  }
}

async function setTelemetryRange(range: TelemetryRange) {
  telemetryRange.value = range;
  await loadTelemetryHistory();
}

async function loadCommandHistory() {
  const d = device.value;
  if (!d || !auth.accessToken) return;

  commandLoading.value = true;
  commandError.value = null;

  try {
    const data = await apiRequest<{ commands: DeviceCommand[] }>(
      `/devices/${d.id}/commands?limit=20`,
      { token: auth.accessToken },
    );
    commandHistory.value = data.commands ?? [];
  } catch (err) {
    commandError.value = loadErrorMessage("Failed to load command history", err);
  } finally {
    commandLoading.value = false;
  }
}

async function loadAlertHistory() {
  const d = device.value;
  if (!d || !auth.accessToken) return;

  alertLoading.value = true;
  alertError.value = null;

  try {
    const data = await apiRequest<{ alerts: DeviceAlert[] }>(
      `/devices/${d.id}/alerts?limit=20`,
      { token: auth.accessToken },
    );
    alertHistory.value = data.alerts ?? [];
  } catch (err) {
    alertError.value = loadErrorMessage("Failed to load alert history", err);
  } finally {
    alertLoading.value = false;
  }
}

async function loadLpwanHealth() {
  const d = device.value;
  if (!d || !auth.accessToken || !isLpwanDevice.value) {
    lpwanHealth.value = null;
    lpwanHealthError.value = null;
    return;
  }

  lpwanHealthLoading.value = true;
  lpwanHealthError.value = null;

  try {
    const data = await apiRequest<{ health: LpwanHealth }>(
      `/devices/${d.id}/lpwan-health`,
      { token: auth.accessToken },
    );
    lpwanHealth.value = data.health;
  } catch (err) {
    lpwanHealth.value = null;
    lpwanHealthError.value = loadErrorMessage("Failed to load LPWAN health", err);
  } finally {
    lpwanHealthLoading.value = false;
  }
}

async function markAlertRead(alert: DeviceAlert) {
  const d = device.value;
  if (!d || !auth.accessToken || alert.isRead) return;

  try {
    const data = await apiRequest<{ alert: DeviceAlert }>(
      `/devices/${d.id}/alerts/${alert.id}/read`,
      {
        method: "PATCH",
        token: auth.accessToken,
      },
    );

    alertHistory.value = alertHistory.value.map((a) =>
      a.id === alert.id ? data.alert : a,
    );
  } catch (err) {
    detailError.value =
      err instanceof Error ? err.message : "Failed to mark alert as read";
  }
}

async function loadDetailPanels() {
  await Promise.all([
    loadTelemetryHistory(),
    loadCommandHistory(),
    loadAlertHistory(),
    loadLpwanHealth(),
  ]);
}

const chartEl = ref<HTMLCanvasElement | null>(null);
const colorRssiEl = ref<HTMLElement | null>(null);
const colorTempEl = ref<HTMLElement | null>(null);
const colorHumEl = ref<HTMLElement | null>(null);

let chart: Chart | null = null;

function defaultTextColor() {
  return window.getComputedStyle(document.body).color || "currentColor";
}

function colorFrom(el: HTMLElement | null) {
  if (!el) return defaultTextColor();
  return window.getComputedStyle(el).color || defaultTextColor();
}

function destroyChart() {
  if (chart) {
    chart.destroy();
    chart = null;
  }
}

function buildChart() {
  if (!isSensorDevice.value) {
    destroyChart();
    return;
  }

  if (!chartEl.value) return;
  if (!device.value) return;

  destroyChart();

  const kind = deviceKind.value;
  const cRssi = colorFrom(colorRssiEl.value);
  const cTemp = colorFrom(colorTempEl.value);
  const cHum = colorFrom(colorHumEl.value);

  const points = [...chartPoints.value].sort(
    (a, b) => Date.parse(a.ts) - Date.parse(b.ts),
  );
  const labels = points.map((p) => new Date(p.ts).toLocaleTimeString());
  const hasSignal = points.some((p) => typeof p.signalDbm === "number");

  const datasets: Array<Record<string, unknown>> = [];

  if (kind === "temperature") {
    datasets.push({
      label: "Temperature (°C)",
      data: points.map((p) => p.temperatureC),
      borderColor: cTemp,
      backgroundColor: cTemp,
      tension: 0.35,
      pointRadius: 0,
    });

    if (hasSignal) {
      datasets.push({
        label: "Signal (dBm)",
        data: points.map((p) =>
          typeof p.signalDbm === "number" ? p.signalDbm : null,
        ),
        borderColor: cRssi,
        backgroundColor: cRssi,
        tension: 0.35,
        spanGaps: true,
        pointRadius: 0,
        yAxisID: "y1",
      });
    }
  } else if (kind === "humidity") {
    datasets.push({
      label: "Humidity (%)",
      data: points.map((p) => p.humidityPct),
      borderColor: cHum,
      backgroundColor: cHum,
      tension: 0.35,
      pointRadius: 0,
    });

    if (hasSignal) {
      datasets.push({
        label: "Signal (dBm)",
        data: points.map((p) =>
          typeof p.signalDbm === "number" ? p.signalDbm : null,
        ),
        borderColor: cRssi,
        backgroundColor: cRssi,
        tension: 0.35,
        spanGaps: true,
        pointRadius: 0,
        yAxisID: "y1",
      });
    }
  } else {
    datasets.push(
      {
        label: "Temperature (°C)",
        data: points.map((p) => p.temperatureC),
        borderColor: cTemp,
        backgroundColor: cTemp,
        tension: 0.35,
        pointRadius: 0,
      },
      {
        label: "Humidity (%)",
        data: points.map((p) => p.humidityPct),
        borderColor: cHum,
        backgroundColor: cHum,
        tension: 0.35,
        pointRadius: 0,
      },
    );

    if (hasSignal) {
      datasets.push({
        label: "Signal (dBm)",
        data: points.map((p) =>
          typeof p.signalDbm === "number" ? p.signalDbm : null,
        ),
        borderColor: cRssi,
        backgroundColor: cRssi,
        tension: 0.35,
        spanGaps: true,
        pointRadius: 0,
        yAxisID: "y1",
      });
    }
  }

  chart = new Chart(chartEl.value, {
    type: "line",
    data: {
      labels,
      datasets: datasets as any,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false,
      },
      plugins: {
        legend: {
          display: true,
        },
      },
      scales: {
        y: {
          beginAtZero: false,
        },
        ...(hasSignal
          ? {
              y1: {
                position: "right",
                grid: {
                  drawOnChartArea: false,
                },
                beginAtZero: false,
              },
            }
          : {}),
      },
    },
  });
}

watch(
  [chartPoints, runtimePoints, cameraFrames, deviceKind],
  () => buildChart(),
  {
    deep: true,
  },
);

watch(deviceId, async () => {
  telemetryHistory.value = [];
  commandHistory.value = [];
  alertHistory.value = [];
  lpwanHealth.value = null;
  telemetryError.value = null;
  commandError.value = null;
  alertError.value = null;
  lpwanHealthError.value = null;
  detailError.value = null;
  await loadDetailPanels();
});

onMounted(async () => {
  loading.value = true;

  try {
    if (!store.devices.length) await store.loadDevices();
  } finally {
    loading.value = false;
  }

  await loadDetailPanels();
  buildChart();
});

onBeforeUnmount(() => {
  destroyChart();
});
</script>

<template>
  <div class="space-y-6">
    <button
      type="button"
      class="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
      @click="backToDevices"
    >
      <ArrowLeftIcon class="h-4 w-4" />
      Back to devices
    </button>

    <div
      v-if="loading"
      class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <p class="text-sm text-slate-500">Loading…</p>
    </div>

    <div
      v-else-if="!device"
      class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <p class="text-sm font-medium text-slate-700">Device not found.</p>
    </div>

    <div v-else class="space-y-6">
      <p
        v-if="detailError"
        class="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"
      >
        {{ detailError }}
      </p>

      <section
        class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
      >
        <div class="border-b border-slate-100 px-6 py-5">
          <div
            class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"
          >
            <div class="flex min-w-0 items-start gap-4">
              <div
                class="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"
              >
                <CpuChipIcon class="h-8 w-8" />
              </div>

              <div class="min-w-0">
                <p
                  class="text-sm font-bold uppercase tracking-wider text-blue-600"
                >
                  Device Detail
                </p>
                <h2
                  class="mt-1 truncate text-2xl font-black tracking-tight text-slate-900"
                >
                  {{ device.name || device.type }}
                </h2>
                <p class="mt-1 text-sm text-slate-500">
                  {{ device.deviceUid ?? device.id }}
                </p>
              </div>
            </div>

            <span
              class="inline-flex w-fit items-center rounded-full px-3 py-1.5 text-sm font-bold"
              :class="statusBadgeClasses(device.status)"
            >
              {{ statusLabel(device.status) }}
            </span>
          </div>
        </div>

        <div class="grid grid-cols-1 gap-4 p-6 sm:grid-cols-2 xl:grid-cols-5">
          <div class="rounded-2xl bg-slate-50 p-4">
            <p class="text-sm font-semibold text-slate-500">Status</p>
            <p class="mt-2 text-xl font-black text-slate-900">
              {{ statusLabel(device.status) }}
            </p>
          </div>

          <div class="rounded-2xl bg-slate-50 p-4">
            <p class="text-sm font-semibold text-slate-500">Power estimated</p>
            <p class="mt-2 text-xl font-black text-slate-900">
              {{ typeof powerW === "number" ? powerW + " W" : "—" }}
            </p>
          </div>

          <div class="rounded-2xl bg-slate-50 p-4">
            <p class="text-sm font-semibold text-slate-500">Last update</p>
            <p class="mt-2 text-base font-black text-slate-900">
              {{ lastActivityLabel }}
            </p>
          </div>

          <div class="rounded-2xl bg-slate-50 p-4">
            <p class="text-sm font-semibold text-slate-500">Template</p>
            <p class="mt-2 text-base font-black text-slate-900">
              {{ device.type }}
            </p>
            <p class="mt-1 text-sm text-slate-500">
              {{ (device.type ?? "").toLowerCase().split(" ").join("-") }}
            </p>
          </div>

          <div class="rounded-2xl bg-slate-50 p-4">
            <p class="text-sm font-semibold text-slate-500">Connection</p>
            <p class="mt-2 text-base font-black text-slate-900">
              {{ connection }}
            </p>
            <p class="mt-1 text-sm text-slate-500">
              UID: {{ device.deviceUid ?? "—" }}
            </p>
          </div>
        </div>
      </section>

      <section
        class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div
          class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
        >
          <div>
            <h3 class="text-base font-bold text-slate-900">
              Latest device activity
            </h3>
            <p class="mt-1 text-sm text-slate-500">
              Most recent update reported by the device.
            </p>
          </div>

          <div
            class="rounded-xl bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-500"
          >
            {{
              latestActivityTs
                ? new Date(latestActivityTs).toLocaleString()
                : "—"
            }}
          </div>
        </div>

        <div class="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div
            v-for="c in latestActivityCards"
            :key="c.label"
            class="rounded-2xl border border-slate-100 bg-slate-50 p-5"
          >
            <p class="text-sm font-semibold text-slate-500">{{ c.label }}</p>
            <p class="mt-2 text-3xl font-black text-slate-900">{{ c.value }}</p>
            <p v-if="c.unit" class="mt-1 text-sm font-semibold text-slate-500">
              {{ c.unit }}
            </p>
          </div>
        </div>

        <div v-if="deviceKind === 'camera'" class="mt-5">
          <p class="text-sm font-bold text-slate-900">Latest frame</p>

          <div
            class="mt-3 overflow-hidden rounded-2xl bg-slate-100 ring-1 ring-inset ring-slate-200"
          >
            <img
              v-if="device.cameraFrameUrl"
              :src="device.cameraFrameUrl"
              alt="Camera frame"
              class="h-72 w-full object-cover"
            />

            <div v-else class="grid h-72 place-items-center">
              <p class="text-sm text-slate-500">
                No camera frame received yet.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section
        v-if="isLpwanDevice"
        class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div
          class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <h3 class="text-base font-bold text-slate-900">
              LPWAN uplink control
            </h3>
            <p
              class="mt-1 text-sm font-semibold"
              :class="
                lpwanUplinkEnabled ? 'text-emerald-600' : 'text-slate-500'
              "
            >
              {{ lpwanUplinkEnabled ? "ENABLED" : "DISABLED" }}
            </p>
          </div>

          <button
            type="button"
            class="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
            :disabled="lpwanControlBusy"
            @click="toggleLpwanUplink"
          >
            {{
              lpwanControlBusy
                ? "Sending..."
                : lpwanUplinkEnabled
                  ? "Disable uplink"
                  : "Enable uplink"
            }}
          </button>
        </div>
      </section>

      <section
        v-if="isLpwanDevice"
        class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div
          class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
        >
          <div>
            <h3 class="text-base font-bold text-slate-900">
              LPWAN network health
            </h3>
            <p class="mt-1 text-sm text-slate-500">
              Radio quality score from RSSI, SNR, battery, spreading factor and
              last accepted uplink.
            </p>
          </div>

          <button
            type="button"
            class="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
            :disabled="lpwanHealthLoading"
            @click="loadLpwanHealth"
          >
            {{ lpwanHealthLoading ? "Loading..." : "Refresh" }}
          </button>
        </div>

        <p
          v-if="lpwanHealthError"
          class="mt-5 rounded-2xl bg-amber-50 px-5 py-4 text-sm font-semibold text-amber-700"
        >
          {{ lpwanHealthError }}
        </p>

        <div v-if="lpwanHealth" class="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div class="rounded-2xl bg-slate-50 p-5">
            <div class="flex items-center justify-between gap-3">
              <p class="text-sm font-semibold text-slate-500">Health score</p>
              <span
                class="rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset"
                :class="lpwanHealthLevelClasses(lpwanHealth.level)"
              >
                {{ lpwanHealth.level }}
              </span>
            </div>

            <p class="mt-3 text-4xl font-black text-slate-900">
              {{ lpwanHealth.score }}
              <span class="text-lg font-bold text-slate-400">/100</span>
            </p>

            <div class="mt-4 h-2 overflow-hidden rounded-full bg-slate-200">
              <div
                class="h-full rounded-full transition-all"
                :class="lpwanScoreBarClasses(lpwanHealth.level)"
                :style="{ width: `${lpwanHealth.score}%` }"
              ></div>
            </div>

            <p class="mt-4 text-sm leading-6 text-slate-600">
              {{ lpwanHealth.summary }}
            </p>
          </div>

          <div class="rounded-2xl bg-slate-50 p-5 lg:col-span-2">
            <p class="text-sm font-semibold text-slate-500">Radio snapshot</p>

            <div class="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              <div>
                <p class="text-xs font-semibold uppercase text-slate-400">
                  Gateway
                </p>
                <p class="mt-1 text-sm font-bold text-slate-900">
                  {{ lpwanHealth.radio.gatewayId || "N/A" }}
                </p>
              </div>

              <div>
                <p class="text-xs font-semibold uppercase text-slate-400">
                  RSSI
                </p>
                <p class="mt-1 text-sm font-bold text-slate-900">
                  {{ fmtNumber(lpwanHealth.radio.lastRssi, 0) }} dBm
                </p>
              </div>

              <div>
                <p class="text-xs font-semibold uppercase text-slate-400">
                  SNR
                </p>
                <p class="mt-1 text-sm font-bold text-slate-900">
                  {{ fmtNumber(lpwanHealth.radio.lastSnr, 1) }} dB
                </p>
              </div>

              <div>
                <p class="text-xs font-semibold uppercase text-slate-400">
                  SF
                </p>
                <p class="mt-1 text-sm font-bold text-slate-900">
                  {{
                    typeof lpwanHealth.radio.lastSpreadingFactor === "number"
                      ? "SF" + lpwanHealth.radio.lastSpreadingFactor
                      : "N/A"
                  }}
                </p>
              </div>

              <div>
                <p class="text-xs font-semibold uppercase text-slate-400">
                  Battery
                </p>
                <p class="mt-1 text-sm font-bold text-slate-900">
                  {{ fmtNumber(lpwanHealth.radio.lastBatteryPct, 1) }}%
                </p>
              </div>

              <div>
                <p class="text-xs font-semibold uppercase text-slate-400">
                  Counter
                </p>
                <p class="mt-1 text-sm font-bold text-slate-900">
                  {{
                    typeof lpwanHealth.radio.lastUplinkCounter === "number"
                      ? lpwanHealth.radio.lastUplinkCounter
                      : "N/A"
                  }}
                </p>
              </div>

              <div>
                <p class="text-xs font-semibold uppercase text-slate-400">
                  Network
                </p>
                <p class="mt-1 text-sm font-bold text-slate-900">
                  {{ lpwanHealth.radio.networkType || "N/A" }}
                </p>
              </div>

              <div>
                <p class="text-xs font-semibold uppercase text-slate-400">
                  Calculated
                </p>
                <p class="mt-1 text-sm font-bold text-slate-900">
                  {{ new Date(lpwanHealth.calculatedAt).toLocaleTimeString() }}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div
          v-if="lpwanHealth"
          class="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2"
        >
          <div
            v-for="check in lpwanHealth.checks"
            :key="check.key"
            class="rounded-2xl border border-slate-100 bg-white p-4"
          >
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="text-sm font-bold text-slate-900">
                  {{ check.label }}
                </p>
                <p class="mt-1 text-sm text-slate-500">{{ check.detail }}</p>
              </div>

              <span
                class="shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset"
                :class="lpwanCheckClasses(check.status)"
              >
                {{ check.status }}
              </span>
            </div>

            <p class="mt-3 text-sm font-semibold text-slate-700">
              {{ check.value }}
            </p>
          </div>
        </div>

        <p
          v-if="!lpwanHealth && !lpwanHealthLoading && !lpwanHealthError"
          class="mt-5 rounded-2xl bg-slate-50 px-5 py-4 text-sm text-slate-500"
        >
          No LPWAN health data available yet.
        </p>
      </section>

      <section
        v-if="isSensorDevice"
        class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div
          class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
        >
          <div>
            <h3 class="text-base font-bold text-slate-900">Telemetry chart</h3>
            <p class="mt-1 text-sm text-slate-500">
              Chart for numeric telemetry such as temperature, humidity and
              signal.
            </p>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <button
              v-for="range in telemetryRanges"
              :key="range"
              type="button"
              class="rounded-xl px-3 py-2 text-sm font-bold ring-1 ring-inset transition disabled:opacity-60"
              :class="
                telemetryRange === range
                  ? 'bg-blue-600 text-white ring-blue-600'
                  : 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50'
              "
              :disabled="historyLoading"
              @click="setTelemetryRange(range)"
            >
              {{ rangeLabel(range) }}
            </button>

            <button
              type="button"
              class="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
              :disabled="historyLoading"
              @click="loadTelemetryHistory"
            >
              {{ historyLoading ? "Loading..." : "Refresh" }}
            </button>
          </div>
        </div>

        <p
          v-if="telemetryError"
          class="mt-5 rounded-2xl bg-amber-50 px-5 py-4 text-sm font-semibold text-amber-700"
        >
          {{ telemetryError }}
        </p>

        <div class="sr-only">
          <span ref="colorRssiEl" class="text-red-500">rssi</span>
          <span ref="colorTempEl" class="text-blue-500">temp</span>
          <span ref="colorHumEl" class="text-amber-500">hum</span>
        </div>

        <div class="mt-5 h-72 rounded-2xl bg-slate-50 p-4">
          <canvas ref="chartEl"></canvas>
        </div>
      </section>

      <section
        v-else-if="deviceKind === 'light'"
        class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h3 class="text-base font-bold text-slate-900">Runtime status</h3>
        <p class="mt-1 text-sm text-slate-500">
          Light is an actuator device, so it is displayed as ON/OFF state
          instead of numeric telemetry chart.
        </p>

        <div class="mt-5 rounded-2xl bg-slate-50 p-5">
          <p class="text-sm font-semibold text-slate-500">
            Current light state
          </p>
          <p class="mt-3 text-4xl font-black text-slate-900">
            {{
              device.lightOn === true
                ? "ON"
                : device.lightOn === false
                  ? "OFF"
                  : "—"
            }}
          </p>
        </div>
      </section>

      <section
        v-else-if="deviceKind === 'ac'"
        class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h3 class="text-base font-bold text-slate-900">Runtime status</h3>
        <p class="mt-1 text-sm text-slate-500">
          Air conditioner is an actuator device, so runtime state is more
          suitable than telemetry chart.
        </p>

        <div class="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div class="rounded-2xl bg-slate-50 p-5">
            <p class="text-sm font-semibold text-slate-500">Current AC state</p>
            <p class="mt-3 text-4xl font-black text-slate-900">
              {{
                device.acOn === true
                  ? "ON"
                  : device.acOn === false
                    ? "OFF"
                    : "—"
              }}
            </p>
          </div>

          <div class="rounded-2xl bg-slate-50 p-5">
            <p class="text-sm font-semibold text-slate-500">
              Target temperature
            </p>
            <p class="mt-3 text-4xl font-black text-slate-900">
              {{
                typeof device.acTargetTempC === "number"
                  ? Math.round(device.acTargetTempC) + "°C"
                  : "—"
              }}
            </p>
          </div>
        </div>
      </section>

      <section
        v-else-if="deviceKind === 'camera'"
        class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h3 class="text-base font-bold text-slate-900">Camera frame status</h3>
        <p class="mt-1 text-sm text-slate-500">
          Camera data is image/frame based, so the system displays latest frame
          and frame history instead of telemetry chart.
        </p>

        <div class="mt-5 rounded-2xl bg-slate-50 p-5">
          <p class="text-sm font-semibold text-slate-500">
            Latest frame status
          </p>
          <p class="mt-3 text-4xl font-black text-slate-900">
            {{ device.cameraFrameUrl ? "RECEIVED" : "—" }}
          </p>
        </div>
      </section>

      <section
        class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
      >
        <div class="border-b border-slate-100 px-6 py-4">
          <div
            class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <h3 class="text-base font-bold text-slate-900">Alert history</h3>
              <p class="mt-1 text-sm text-slate-500">
                Stored warning events for this device.
              </p>
            </div>

            <div class="flex items-center gap-2">
              <span
                class="rounded-xl bg-amber-50 px-3 py-2 text-sm font-bold text-amber-700"
              >
                {{ unreadAlertCount }} unread
              </span>
              <button
                type="button"
                class="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                :disabled="alertLoading"
                @click="loadAlertHistory"
              >
                {{ alertLoading ? "Loading..." : "Refresh" }}
              </button>
            </div>
          </div>
        </div>

        <p
          v-if="alertError"
          class="mx-6 mt-4 rounded-2xl bg-amber-50 px-5 py-4 text-sm font-semibold text-amber-700"
        >
          {{ alertError }}
        </p>

        <div class="divide-y divide-slate-100">
          <div
            v-for="alert in alertHistory"
            :key="alert.id"
            class="px-6 py-4"
          >
            <div
              class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"
            >
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                  <span
                    class="rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset"
                    :class="alertSeverityClasses(alert.severity)"
                  >
                    {{ alert.severity }}
                  </span>
                  <span
                    class="rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset"
                    :class="
                      alert.isRead
                        ? 'bg-slate-100 text-slate-600 ring-slate-200'
                        : 'bg-blue-50 text-blue-700 ring-blue-200'
                    "
                  >
                    {{ alert.isRead ? "READ" : "UNREAD" }}
                  </span>
                </div>

                <p class="mt-2 text-sm font-bold text-slate-900">
                  {{ alert.title }}
                </p>
                <p class="mt-1 text-sm leading-6 text-slate-600">
                  {{ alert.message }}
                </p>
                <p class="mt-1 text-xs text-slate-400">
                  {{ new Date(alert.createdAt).toLocaleString() }}
                </p>
              </div>

              <button
                type="button"
                class="rounded-xl bg-slate-900 px-3 py-2 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                :disabled="alert.isRead"
                @click="markAlertRead(alert)"
              >
                Mark read
              </button>
            </div>
          </div>

          <p
            v-if="alertHistory.length === 0"
            class="px-6 py-8 text-center text-sm text-slate-500"
          >
            No alerts recorded for this device yet.
          </p>
        </div>
      </section>

      <section
        class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
      >
        <div class="border-b border-slate-100 px-6 py-4">
          <div
            class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <h3 class="text-base font-bold text-slate-900">
                Control history
              </h3>
              <p class="mt-1 text-sm text-slate-500">
                Recent control actions sent to this device.
              </p>
            </div>

            <button
              type="button"
              class="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
              :disabled="commandLoading"
              @click="loadCommandHistory"
            >
              {{ commandLoading ? "Loading..." : "Refresh" }}
            </button>
          </div>
        </div>

        <p
          v-if="commandError"
          class="mx-6 mt-4 rounded-2xl bg-amber-50 px-5 py-4 text-sm font-semibold text-amber-700"
        >
          {{ commandError }}
        </p>

        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-slate-100">
            <thead class="bg-slate-50">
              <tr>
                <th
                  class="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500"
                >
                  Time
                </th>
                <th
                  class="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500"
                >
                  Action
                </th>
                <th
                  class="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500"
                >
                  Result
                </th>
                <th
                  class="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500"
                >
                  Note
                </th>
              </tr>
            </thead>

            <tbody class="divide-y divide-slate-100 bg-white">
              <tr
                v-for="cmd in commandHistory"
                :key="cmd.id"
                class="transition hover:bg-slate-50"
              >
                <td
                  class="whitespace-nowrap px-5 py-3 text-sm font-medium text-slate-600"
                >
                  {{ new Date(cmd.createdAt).toLocaleString() }}
                </td>
                <td class="px-5 py-3 text-sm font-semibold text-slate-800">
                  {{ commandActionLabel(cmd) }}
                </td>
                <td class="whitespace-nowrap px-5 py-3 text-sm">
                  <span
                    class="rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset"
                    :class="commandStatusClasses(cmd.status)"
                  >
                    {{ commandResultLabel(cmd) }}
                  </span>
                </td>
                <td class="px-5 py-3 text-sm text-slate-500">
                  {{ commandResultNote(cmd) }}
                </td>
              </tr>

              <tr v-if="commandHistory.length === 0">
                <td
                  colspan="4"
                  class="px-5 py-8 text-center text-sm text-slate-500"
                >
                  No commands recorded for this device yet.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section
        class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
      >
        <div class="border-b border-slate-100 px-6 py-4">
          <div
            class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <h3 class="text-base font-bold text-slate-900">
                {{ activityTitle }}
              </h3>
              <p class="mt-1 text-sm text-slate-500">
                {{ activityDescription }}
              </p>
            </div>

            <div
              class="inline-flex w-fit items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-500"
            >
              <ClockIcon class="h-4 w-4" />
              {{ activityCount }} records
            </div>
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-slate-100">
            <thead class="bg-slate-50">
              <tr>
                <th
                  class="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500"
                >
                  Time
                </th>

                <th
                  v-if="deviceKind === 'camera'"
                  class="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500"
                >
                  Frame
                </th>

                <th
                  v-if="
                    deviceKind === 'temperature' || deviceKind === 'generic'
                  "
                  class="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500"
                >
                  Temperature (°C)
                </th>

                <th
                  v-if="deviceKind === 'humidity' || deviceKind === 'generic'"
                  class="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500"
                >
                  Humidity (%)
                </th>

                <th
                  v-if="
                    deviceKind !== 'light' &&
                    deviceKind !== 'ac' &&
                    deviceKind !== 'camera'
                  "
                  class="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500"
                >
                  Signal (dBm)
                </th>

                <th
                  v-if="deviceKind === 'light'"
                  class="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500"
                >
                  Light
                </th>

                <th
                  v-if="deviceKind === 'ac'"
                  class="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500"
                >
                  Air conditioner
                </th>

                <th
                  v-if="deviceKind === 'ac'"
                  class="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500"
                >
                  Target temperature
                </th>
              </tr>
            </thead>

            <tbody class="divide-y divide-slate-100 bg-white">
              <template v-if="deviceKind === 'camera'">
                <tr
                  v-for="f in cameraFrameRows"
                  :key="f.ts"
                  class="transition hover:bg-slate-50"
                >
                  <td
                    class="whitespace-nowrap px-5 py-3 text-sm font-medium text-slate-600"
                  >
                    {{ new Date(f.ts).toLocaleString() }}
                  </td>
                  <td
                    class="whitespace-nowrap px-5 py-3 text-sm font-bold text-slate-900"
                  >
                    RECEIVED
                  </td>
                </tr>
              </template>

              <template v-else-if="deviceKind === 'light'">
                <tr
                  v-for="p in runtimeRows"
                  :key="p.ts"
                  class="transition hover:bg-slate-50"
                >
                  <td
                    class="whitespace-nowrap px-5 py-3 text-sm font-medium text-slate-600"
                  >
                    {{ new Date(p.ts).toLocaleString() }}
                  </td>
                  <td
                    class="whitespace-nowrap px-5 py-3 text-sm font-bold text-slate-900"
                  >
                    {{
                      typeof p.lightOn === "boolean"
                        ? p.lightOn
                          ? "ON"
                          : "OFF"
                        : "—"
                    }}
                  </td>
                </tr>
              </template>

              <template v-else-if="deviceKind === 'ac'">
                <tr
                  v-for="p in runtimeRows"
                  :key="p.ts"
                  class="transition hover:bg-slate-50"
                >
                  <td
                    class="whitespace-nowrap px-5 py-3 text-sm font-medium text-slate-600"
                  >
                    {{ new Date(p.ts).toLocaleString() }}
                  </td>
                  <td
                    class="whitespace-nowrap px-5 py-3 text-sm font-bold text-slate-900"
                  >
                    {{
                      typeof p.acOn === "boolean"
                        ? p.acOn
                          ? "ON"
                          : "OFF"
                        : "—"
                    }}
                  </td>
                  <td
                    class="whitespace-nowrap px-5 py-3 text-sm text-slate-700"
                  >
                    {{
                      typeof p.acTargetTempC === "number"
                        ? Math.round(p.acTargetTempC) + "°C"
                        : "—"
                    }}
                  </td>
                </tr>
              </template>

              <template v-else>
                <tr
                  v-for="p in telemetryRows"
                  :key="p.ts"
                  class="transition hover:bg-slate-50"
                >
                  <td
                    class="whitespace-nowrap px-5 py-3 text-sm font-medium text-slate-600"
                  >
                    {{ new Date(p.ts).toLocaleString() }}
                  </td>

                  <td
                    v-if="
                      deviceKind === 'temperature' || deviceKind === 'generic'
                    "
                    class="whitespace-nowrap px-5 py-3 text-sm text-slate-700"
                  >
                    {{ fmtNumber(p.temperatureC, 2) }}
                  </td>

                  <td
                    v-if="deviceKind === 'humidity' || deviceKind === 'generic'"
                    class="whitespace-nowrap px-5 py-3 text-sm text-slate-700"
                  >
                    {{ fmtNumber(p.humidityPct, 2) }}
                  </td>

                  <td
                    class="whitespace-nowrap px-5 py-3 text-sm text-slate-700"
                  >
                    {{ fmtNumber(p.signalDbm, 0) }}
                  </td>
                </tr>
              </template>

              <tr v-if="activityCount === 0">
                <td
                  colspan="4"
                  class="px-5 py-8 text-center text-sm text-slate-500"
                >
                  No activity records yet.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </div>
</template>
