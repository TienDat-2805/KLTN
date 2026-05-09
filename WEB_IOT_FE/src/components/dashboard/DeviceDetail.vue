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

const store = useDeviceStore();
const route = useRoute();
const router = useRouter();

const deviceId = computed(() => String(route.params.id ?? ""));

const loading = ref(false);

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
  return [...windowPoints.value]
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

function backToDevices() {
  router.push("/app/devices");
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

  const points = [...windowPoints.value].sort(
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
  [windowPoints, runtimePoints, cameraFrames, deviceKind],
  () => buildChart(),
  {
    deep: true,
  },
);

onMounted(async () => {
  loading.value = true;

  try {
    if (!store.devices.length) await store.loadDevices();
  } finally {
    loading.value = false;
  }

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

          <div
            class="rounded-xl bg-blue-50 px-3 py-2 text-sm font-bold text-blue-700"
          >
            Realtime data
          </div>
        </div>

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
