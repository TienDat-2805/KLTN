<script setup lang="ts">
import { computed, reactive } from "vue";

import {
  AdjustmentsHorizontalIcon,
  BeakerIcon,
  CameraIcon,
  CpuChipIcon,
  ExclamationTriangleIcon,
  FireIcon,
  LightBulbIcon,
  PowerIcon,
  SignalIcon,
  WifiIcon,
} from "@heroicons/vue/24/outline";

import DeviceCard from "./DeviceCard.vue";
import { useDeviceStore, type Device } from "../../store/deviceStore";

const store = useDeviceStore();

type MetricItem = {
  key: "temperature" | "humidity";
  label: string;
  value: string;
};

function splitMetricValue(value: string) {
  const v = (value ?? "").trim();
  if (!v || v === "—") return { num: "—", unit: "" };
  const m = v.match(/^(-?\d+(?:\.\d+)?)\s*(.*)$/);
  if (!m) return { num: v, unit: "" };
  return { num: m[1] ?? v, unit: (m[2] ?? "").trim() };
}

const summaryCards = computed(() => [
  {
    icon: CpuChipIcon,
    title: "Total Devices",
    value: store.totalDevices,
    description: "All registered devices",
    tone: "blue" as const,
  },
  {
    icon: WifiIcon,
    title: "Active Devices",
    value: store.activeDevices,
    description: "Currently online",
    tone: "green" as const,
  },
  {
    icon: SignalIcon,
    title: "Offline Devices",
    value: store.offlineDevices,
    description: "Require attention",
    tone: "red" as const,
  },
  {
    icon: ExclamationTriangleIcon,
    title: "Alerts",
    value: store.alerts,
    description: "Warnings detected",
    tone: "yellow" as const,
  },
]);

const acTargetDraft = reactive<Record<string, number>>({});

function canonicalType(type: string) {
  const raw = (type ?? "").trim();
  const k = raw.toLowerCase();

  if (k === "temperature sensor" || k === "temp sensor") return "Temperature";
  if (k === "humidity sensor") return "Humidity";
  if (k === "signal monitor") return "Signal Monitor";
  if (k === "edge gateway") return "Edge Gateway";
  if (k === "multi-sensor node") return "Multi-Sensor Node";

  if (k === "temperature") return "Temperature";
  if (k === "humidity") return "Humidity";
  if (k === "light") return "Light";
  if (k === "camera") return "Camera";
  if (k === "air conditioner" || k === "ac") return "Air Conditioner";

  return raw;
}

function iconForDevice(deviceType: string) {
  switch (canonicalType(deviceType)) {
    case "Light":
      return LightBulbIcon;
    case "Camera":
      return CameraIcon;
    case "Humidity":
      return BeakerIcon;
    case "Temperature":
      return FireIcon;
    case "Air Conditioner":
      return AdjustmentsHorizontalIcon;
    case "Signal Monitor":
      return SignalIcon;
    case "Edge Gateway":
      return CpuChipIcon;
    case "Multi-Sensor Node":
      return CpuChipIcon;
    default:
      return CpuChipIcon;
  }
}

function acDraftValue(d: Device) {
  return acTargetDraft[d.id] ?? d.acTargetTempC ?? 24;
}

function onAcDraftInput(deviceId: string, e: Event) {
  const el = e.target as HTMLInputElement | null;
  if (!el) return;
  const v = Number(el.value);
  if (!Number.isFinite(v)) return;
  acTargetDraft[deviceId] = v;
}

async function onAcTargetChange(d: Device, e: Event) {
  onAcDraftInput(d.id, e);
  const raw = acDraftValue(d);
  const clamped = Math.max(16, Math.min(30, Math.round(raw)));
  acTargetDraft[d.id] = clamped;
  await store.setAirConditioner({ id: d.id, targetTempC: clamped });
}

async function toggleLight(d: Device) {
  const nextOn = !(d.lightOn ?? false);
  await store.setLight({ id: d.id, on: nextOn });
}

async function toggleAirConditioner(d: Device) {
  const nextOn = !(d.acOn ?? false);
  await store.setAirConditioner({ id: d.id, on: nextOn });
}

function canControlDeviceEnabled(d: Device) {
  return d.connectionType === "LPWAN" || d.connectionType === "WIRED";
}

function deviceEnabled(d: Device) {
  return d.isEnabled !== false;
}

async function toggleDeviceEnabled(d: Device) {
  if (!canControlDeviceEnabled(d)) return;

  await store.setDeviceEnabled({
    id: d.id,
    enabled: !deviceEnabled(d),
  });
}

function statusPill(on: boolean | undefined) {
  if (on === true) {
    return "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200";
  }

  if (on === false) {
    return "bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200";
  }

  return "bg-slate-100 text-slate-500 ring-1 ring-inset ring-slate-200";
}

function statusBadgeClasses(status: string) {
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

function statusLabel(status: string) {
  switch (status) {
    case "ONLINE":
      return "Online";
    case "OFFLINE":
      return "Offline";
    case "WARNING":
      return "Warning";
    default:
      return status;
  }
}

function metricGridCols(count: number) {
  switch (count) {
    case 1:
      return "grid-cols-1";
    case 2:
      return "grid-cols-2";
    default:
      return "grid-cols-3";
  }
}

function metricsForDevice(
  deviceType: string,
  telemetry: { temperatureC: number; humidityPct: number } | null,
) {
  const t = telemetry;

  const temperature: MetricItem = {
    key: "temperature",
    label: "Temp",
    value: t ? `${t.temperatureC.toFixed(1)}°C` : "—",
  };

  const humidity: MetricItem = {
    key: "humidity",
    label: "Humidity",
    value: t ? `${Math.round(t.humidityPct)}%` : "—",
  };

  switch (canonicalType(deviceType)) {
    case "Temperature":
      return [temperature];
    case "Humidity":
      return [humidity];
    case "Multi-Sensor Node":
      return [temperature, humidity];
    case "Signal Monitor":
      return [];
    case "Edge Gateway":
      return [];
    case "Light":
      return [];
    case "Camera":
      return [];
    case "Air Conditioner":
      return [];
    default:
      return [];
  }
}

</script>

<template>
  <div class="space-y-6">
    <section class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <DeviceCard
        v-for="card in summaryCards"
        :key="card.title"
        :icon="card.icon"
        :title="card.title"
        :value="card.value"
        :description="card.description"
        :tone="card.tone"
      />
    </section>

    <section
      class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
    >
      <div class="border-b border-slate-100 px-5 py-4">
        <div class="flex items-start justify-between gap-4">
          <div>
            <h2 class="text-base font-bold text-slate-900">Devices</h2>
            <p class="mt-1 text-sm text-slate-500">
              Quick status and latest telemetry for each device.
            </p>
          </div>

          <div
            v-if="store.loading"
            class="rounded-full bg-slate-50 px-3 py-1 text-sm font-semibold text-slate-500"
          >
            Loading…
          </div>
        </div>
      </div>

      <div class="p-5">
        <p
          v-if="store.error"
          class="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-600"
        >
          {{ store.error }}
        </p>

        <div
          v-else-if="store.devices.length === 0"
          class="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-12 text-center"
        >
          <div
            class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-slate-500 shadow-sm"
          >
            <CpuChipIcon class="h-7 w-7" />
          </div>

          <h3 class="mt-4 text-base font-bold text-slate-900">
            No devices yet
          </h3>
          <p class="mt-1 text-sm text-slate-500">
            Add your first device to start monitoring.
          </p>
        </div>

        <div
          v-else
          class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
        >
          <article
            v-for="d in store.devices"
            :key="d.id"
            class="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-blue-100 hover:shadow-md"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="flex min-w-0 items-center gap-3">
                <div class="rounded-xl bg-blue-50 p-2.5 text-blue-600">
                  <component
                    :is="iconForDevice(d.type)"
                    class="h-6 w-6"
                    aria-hidden="true"
                  />
                </div>

                <div class="min-w-0">
                  <p class="truncate text-sm font-bold text-slate-900">
                    {{ d.name }}
                  </p>
                  <p class="mt-0.5 truncate text-xs text-slate-500">
                    {{ d.type }}
                  </p>
                </div>
              </div>

              <div class="flex shrink-0 flex-col items-end gap-2">
                <span
                  :class="statusBadgeClasses(d.status)"
                  class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold"
                >
                  {{ statusLabel(d.status) }}
                </span>

                <button
                  v-if="canControlDeviceEnabled(d)"
                  type="button"
                  class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset transition disabled:cursor-not-allowed disabled:opacity-60"
                  :class="
                    deviceEnabled(d)
                      ? 'bg-emerald-50 text-emerald-700 ring-emerald-200 hover:bg-emerald-100'
                      : 'bg-slate-100 text-slate-700 ring-slate-200 hover:bg-slate-200'
                  "
                  :disabled="store.isDeviceEnabledBusy(d.id)"
                  @click="toggleDeviceEnabled(d)"
                >
                  <PowerIcon class="h-3.5 w-3.5" />
                  {{
                    store.isDeviceEnabledBusy(d.id)
                      ? "Đang gửi"
                      : deviceEnabled(d)
                        ? "Tắt thiết bị"
                        : "Bật thiết bị"
                  }}
                </button>
              </div>
            </div>

            <div
              v-if="metricsForDevice(d.type, d.latestTelemetry).length"
              class="mt-4 grid gap-2"
              :class="
                metricGridCols(
                  metricsForDevice(d.type, d.latestTelemetry).length,
                )
              "
            >
              <div
                v-for="m in metricsForDevice(d.type, d.latestTelemetry)"
                :key="m.key"
                class="rounded-2xl bg-slate-50 px-3 py-3"
              >
                <p class="text-xs font-semibold text-slate-500">
                  {{ m.label }}
                </p>

                <div
                  v-if="m.key === 'temperature' || m.key === 'humidity'"
                  class="mt-2 flex justify-center"
                >
                  <div
                    class="flex h-20 w-20 flex-col items-center justify-center rounded-full bg-white ring-1 ring-inset ring-slate-200"
                  >
                    <p class="text-lg font-black text-slate-900">
                      {{ splitMetricValue(m.value).num }}
                    </p>
                    <p class="text-xs font-semibold text-slate-500">
                      {{ splitMetricValue(m.value).unit }}
                    </p>
                  </div>
                </div>

                <p v-else class="mt-0.5 text-sm font-bold text-slate-900">
                  {{ m.value }}
                </p>
              </div>
            </div>

            <div
              v-if="canonicalType(d.type) === 'Light'"
              class="mt-4 rounded-2xl bg-slate-50 px-3 py-3"
            >
              <div class="flex items-center justify-between gap-3">
                <p class="text-xs font-bold text-slate-600">Light</p>
                <span
                  :class="statusPill(d.lightOn)"
                  class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold"
                >
                  {{
                    d.lightOn === true
                      ? "ON"
                      : d.lightOn === false
                        ? "OFF"
                        : "—"
                  }}
                </span>
              </div>

              <div class="mt-4 flex items-center justify-center">
                <button
                  type="button"
                  class="group grid h-28 w-28 place-items-center rounded-full bg-slate-900 text-white shadow-sm ring-8 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  :class="d.lightOn ? 'ring-emerald-100' : 'ring-slate-100'"
                  :disabled="
                    !deviceEnabled(d) ||
                    d.status === 'OFFLINE' ||
                    store.isLightBusy(d.id)
                  "
                  @click="toggleLight(d)"
                >
                  <span class="text-xl font-bold tracking-wide">
                    {{ d.lightOn ? "ON" : "OFF" }}
                  </span>
                </button>
              </div>

              <p
                v-if="!deviceEnabled(d) || d.status === 'OFFLINE'"
                class="mt-2 text-xs text-slate-500"
              >
                {{
                  !deviceEnabled(d)
                    ? "Device is disabled."
                    : "Device is offline."
                }}
              </p>
            </div>

            <div
              v-else-if="canonicalType(d.type) === 'Air Conditioner'"
              class="mt-4 rounded-2xl bg-slate-50 px-3 py-3"
            >
              <div class="flex items-center justify-between gap-3">
                <p class="text-xs font-bold text-slate-600">Air Conditioner</p>
                <span
                  :class="statusPill(d.acOn)"
                  class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold"
                >
                  {{ d.acOn === true ? "ON" : d.acOn === false ? "OFF" : "—" }}
                </span>
              </div>

              <div class="mt-3">
                <button
                  type="button"
                  class="inline-flex w-full items-center justify-center rounded-xl bg-slate-900 px-3 py-2 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  :disabled="
                    !deviceEnabled(d) ||
                    d.status === 'OFFLINE' ||
                    store.isAcBusy(d.id)
                  "
                  @click="toggleAirConditioner(d)"
                >
                  {{ d.acOn ? "Turn off" : "Turn on" }}
                </button>
              </div>

              <div class="mt-3">
                <div class="flex items-center justify-between gap-3">
                  <p class="text-xs font-semibold text-slate-500">
                    Target temperature
                  </p>
                  <p class="text-xs font-bold text-slate-900">
                    {{ Math.round(acDraftValue(d)) }}°C
                  </p>
                </div>

                <input
                  type="range"
                  min="16"
                  max="30"
                  step="1"
                  class="mt-2 w-full accent-blue-600"
                  :value="acDraftValue(d)"
                  :disabled="
                    !deviceEnabled(d) ||
                    d.status === 'OFFLINE' ||
                    store.isAcTargetBusy(d.id)
                  "
                  @input="onAcDraftInput(d.id, $event)"
                  @change="onAcTargetChange(d, $event)"
                />
              </div>

              <p
                v-if="!deviceEnabled(d) || d.status === 'OFFLINE'"
                class="mt-2 text-xs text-slate-500"
              >
                {{
                  !deviceEnabled(d)
                    ? "Device is disabled."
                    : "Device is offline."
                }}
              </p>
            </div>

            <div
              v-else-if="canonicalType(d.type) === 'Camera'"
              class="mt-4 overflow-hidden rounded-2xl bg-slate-50"
            >
              <div class="flex items-center justify-between px-3 py-2">
                <p class="text-xs font-bold text-slate-600">Live view</p>
                <p class="text-xs text-slate-400">Realtime</p>
              </div>

              <div class="aspect-video w-full bg-slate-100">
                <img
                  v-if="d.cameraFrameUrl"
                  :src="d.cameraFrameUrl"
                  alt="Camera live frame"
                  class="h-full w-full object-cover"
                />

                <div v-else class="grid h-full place-items-center">
                  <p class="text-sm text-slate-500">No frames yet.</p>
                </div>
              </div>
            </div>

            <div
              class="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-3"
            >
              <p class="text-xs text-slate-500">Last update</p>
              <p class="text-xs font-bold text-slate-900">
                {{ store.getLastUpdateLabel(d) }}
              </p>
            </div>
          </article>
        </div>
      </div>
    </section>
  </div>
</template>
