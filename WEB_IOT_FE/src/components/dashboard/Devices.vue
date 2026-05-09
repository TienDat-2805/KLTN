<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";

import {
  ArrowPathIcon,
  CpuChipIcon,
  PlusIcon,
} from "@heroicons/vue/24/outline";

import DeviceTable, { type DeviceRow } from "./DeviceTable.vue";
import { useDeviceStore } from "../../store/deviceStore";

const store = useDeviceStore();
const router = useRouter();

function connectionLabel(connectionType: string | undefined) {
  if (connectionType === "LPWAN") return "LPWAN";
  if (connectionType === "WIRED") return "Wired";
  if (connectionType === "WIFI") return "Wi-Fi";
  return "—";
}

const rows = computed<DeviceRow[]>(() => {
  return store.devices.map((d) => ({
    id: d.id,
    name: d.name,
    type: d.type,
    connection: connectionLabel(d.connectionType),
    status: d.status,
    lastUpdate: store.getLastUpdateLabel(d),
    spark: store
      .getTelemetryWindow(d.id)
      .map((p) => p.rssi ?? p.signalDbm)
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v)),
  }));
});

async function onRenameDevice(input: { id: string; name: string }) {
  await store.updateDeviceName(input);
}

async function onDeleteDevice(device: DeviceRow) {
  const ok = window.confirm(`Delete device "${device.name}"?`);
  if (!ok) return;
  await store.deleteDevice({ id: device.id });
}

function onViewDevice(device: DeviceRow) {
  router.push(`/app/devices/${device.id}`);
}
</script>

<template>
  <div class="space-y-6">
    <section
      class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"
    >
      <div>
        <p class="text-sm font-bold uppercase tracking-wider text-blue-600">
          Device Management
        </p>
        <h2 class="mt-1 text-2xl font-black tracking-tight text-slate-900">
          Quản lý thiết bị
        </h2>
      </div>

      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
          @click="store.loadDevices()"
        >
          <ArrowPathIcon class="h-4 w-4" />
          Làm mới
        </button>

        <RouterLink
          to="/app/add-device"
          class="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700"
        >
          <PlusIcon class="h-4 w-4" />
          Thêm thiết bị
        </RouterLink>
      </div>
    </section>

    <section class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-sm font-semibold text-slate-500">Tổng thiết bị</p>
            <p class="mt-2 text-3xl font-black text-slate-900">
              {{ store.totalDevices }}
            </p>
          </div>
          <div class="rounded-2xl bg-blue-50 p-3 text-blue-600">
            <CpuChipIcon class="h-6 w-6" />
          </div>
        </div>
      </div>

      <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-sm font-semibold text-slate-500">Online</p>
            <p class="mt-2 text-3xl font-black text-emerald-600">
              {{ store.activeDevices }}
            </p>
          </div>
          <div class="rounded-2xl bg-emerald-50 p-3 text-emerald-600">
            <span class="block h-6 w-6 rounded-full bg-emerald-500" />
          </div>
        </div>
      </div>

      <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-sm font-semibold text-slate-500">Offline</p>
            <p class="mt-2 text-3xl font-black text-red-600">
              {{ store.offlineDevices }}
            </p>
          </div>
          <div class="rounded-2xl bg-red-50 p-3 text-red-600">
            <span class="block h-6 w-6 rounded-full bg-red-500" />
          </div>
        </div>
      </div>

      <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-sm font-semibold text-slate-500">Cảnh báo</p>
            <p class="mt-2 text-3xl font-black text-amber-600">
              {{ store.alerts }}
            </p>
          </div>
          <div class="rounded-2xl bg-amber-50 p-3 text-amber-600">
            <span class="block h-6 w-6 rounded-full bg-amber-500" />
          </div>
        </div>
      </div>
    </section>

    <p
      v-if="store.error"
      class="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-600"
    >
      {{ store.error }}
    </p>

    <DeviceTable
      :devices="rows"
      @view="onViewDevice"
      @rename="onRenameDevice"
      @delete="onDeleteDevice"
    />
  </div>
</template>
