<script setup lang="ts">
import { computed, ref } from "vue";

import {
  EyeIcon,
  PencilSquareIcon,
  TrashIcon,
  CheckIcon,
  XMarkIcon,
  MagnifyingGlassIcon,
} from "@heroicons/vue/24/outline";

export type DeviceStatus = "ONLINE" | "OFFLINE" | "WARNING";

export type DeviceRow = {
  id: string;
  name: string;
  type: string;
  connection: string;
  status: DeviceStatus;
  lastUpdate: string;
  spark: number[];
};

const props = defineProps<{
  devices: DeviceRow[];
}>();

const emit = defineEmits<{
  (e: "view", device: DeviceRow): void;
  (e: "rename", input: { id: string; name: string }): void;
  (e: "delete", device: DeviceRow): void;
}>();

const editingId = ref<string | null>(null);
const draftName = ref("");
const nameQuery = ref("");

const filteredDevices = computed(() => {
  const q = nameQuery.value.trim().toLowerCase();
  if (!q) return props.devices;

  return props.devices.filter((d) => {
    const name = (d.name ?? "").toLowerCase();
    const type = (d.type ?? "").toLowerCase();
    const connection = (d.connection ?? "").toLowerCase();
    const status = (d.status ?? "").toLowerCase();
    return (
      name.includes(q) ||
      type.includes(q) ||
      connection.includes(q) ||
      status.includes(q)
    );
  });
});

function startEdit(device: DeviceRow) {
  editingId.value = device.id;
  draftName.value = device.name;
}

function cancelEdit() {
  editingId.value = null;
  draftName.value = "";
}

function saveEdit(device: DeviceRow) {
  const name = draftName.value.trim();
  if (!name) return;
  emit("rename", { id: device.id, name });
  cancelEdit();
}

function removeDevice(device: DeviceRow) {
  emit("delete", device);
}

function viewMore(device: DeviceRow) {
  emit("view", device);
}

function statusBadgeClasses(status: DeviceStatus) {
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

function statusLabel(status: DeviceStatus) {
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

function connectionBadgeClasses(connection: string) {
  const value = connection.toUpperCase();

  if (
    value.includes("LPWAN") ||
    value.includes("LORAWAN") ||
    value.includes("NB")
  ) {
    return "bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-200";
  }

  if (value.includes("WIFI")) {
    return "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200";
  }

  if (value.includes("WIRED")) {
    return "bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200";
  }

  return "bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200";
}

function sparkPolylinePoints(values: number[]) {
  if (!values.length) return "";

  const width = 120;
  const height = 30;
  const padding = 3;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX =
    values.length > 1 ? (width - padding * 2) / (values.length - 1) : 0;

  return values
    .map((v, i) => {
      const x = padding + i * stepX;
      const y = padding + (height - padding * 2) * (1 - (v - min) / range);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function lastValue(values: number[]) {
  if (!values.length) return null;
  return values[values.length - 1];
}
</script>

<template>
  <div
    class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
  >
    <div class="border-b border-slate-100 px-5 py-4">
      <div
        class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"
      >
        <div>
          <h3 class="text-base font-bold text-slate-900">
            Hoạt động thiết bị gần đây
          </h3>
        </div>

        <div class="relative w-full lg:w-80">
          <MagnifyingGlassIcon
            class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          />
          <input
            id="device-name-search"
            v-model="nameQuery"
            type="search"
            placeholder="Tìm thiết bị, loại kết nối..."
            class="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-50"
          />
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
              Thiết bị
            </th>
            <th
              class="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500"
            >
              Loại
            </th>
            <th
              class="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500"
            >
              Kết nối
            </th>
            <th
              class="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500"
            >
              Trạng thái
            </th>
            <th
              class="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500"
            >
              Tín hiệu
            </th>
            <th
              class="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500"
            >
              Cập nhật
            </th>
            <th
              class="px-5 py-3 text-right text-xs font-bold uppercase tracking-wider text-slate-500"
            >
              Thao tác
            </th>
          </tr>
        </thead>

        <tbody class="divide-y divide-slate-100 bg-white">
          <tr v-if="filteredDevices.length === 0">
            <td
              colspan="7"
              class="px-5 py-10 text-center text-sm text-slate-500"
            >
              Không tìm thấy thiết bị phù hợp.
            </td>
          </tr>

          <tr
            v-for="device in filteredDevices"
            :key="device.id"
            class="transition hover:bg-slate-50/80"
          >
            <td class="whitespace-nowrap px-5 py-4">
              <div
                v-if="editingId === device.id"
                class="flex min-w-64 items-center gap-2"
              >
                <input
                  v-model="draftName"
                  type="text"
                  class="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
                  @keyup.enter="saveEdit(device)"
                  @keyup.esc="cancelEdit"
                />

                <button
                  type="button"
                  class="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 transition hover:bg-emerald-100"
                  @click="saveEdit(device)"
                  aria-label="Lưu tên thiết bị"
                >
                  <CheckIcon class="h-4 w-4" />
                </button>

                <button
                  type="button"
                  class="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600 transition hover:bg-slate-200"
                  @click="cancelEdit"
                  aria-label="Hủy sửa"
                >
                  <XMarkIcon class="h-4 w-4" />
                </button>
              </div>

              <div v-else class="flex items-center gap-3">
                <div
                  class="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-sm font-black text-blue-600"
                >
                  {{ device.name.charAt(0).toUpperCase() }}
                </div>
                <div>
                  <p class="text-sm font-bold text-slate-900">
                    {{ device.name }}
                  </p>
                </div>
              </div>
            </td>

            <td class="whitespace-nowrap px-5 py-4 text-sm text-slate-600">
              {{ device.type }}
            </td>

            <td class="whitespace-nowrap px-5 py-4">
              <span
                class="inline-flex rounded-full px-2.5 py-1 text-xs font-bold"
                :class="connectionBadgeClasses(device.connection)"
              >
                {{ device.connection }}
              </span>
            </td>

            <td class="whitespace-nowrap px-5 py-4">
              <span
                class="inline-flex rounded-full px-2.5 py-1 text-xs font-bold"
                :class="statusBadgeClasses(device.status)"
              >
                {{ statusLabel(device.status) }}
              </span>
            </td>

            <td class="whitespace-nowrap px-5 py-4">
              <div class="flex items-center gap-3">
                <div class="h-[30px] w-[120px]">
                  <svg viewBox="0 0 120 30" class="h-full w-full">
                    <polyline
                      v-if="device.spark.length"
                      :points="sparkPolylinePoints(device.spark)"
                      fill="none"
                      stroke="currentColor"
                      class="text-blue-500"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                    <line
                      v-else
                      x1="3"
                      x2="117"
                      y1="15"
                      y2="15"
                      stroke="currentColor"
                      class="text-slate-200"
                      stroke-width="2"
                      stroke-linecap="round"
                    />
                  </svg>
                </div>

                <div class="text-sm text-slate-700">
                  <span
                    v-if="lastValue(device.spark) !== null"
                    class="font-bold"
                  >
                    {{ Math.round(lastValue(device.spark) ?? 0) }} dBm
                  </span>
                  <span v-else class="text-slate-400">—</span>
                </div>
              </div>
            </td>

            <td
              class="whitespace-nowrap px-5 py-4 text-sm font-medium text-slate-500"
            >
              {{ device.lastUpdate }}
            </td>

            <td class="whitespace-nowrap px-5 py-4">
              <div class="flex items-center justify-end gap-2">
                <button
                  type="button"
                  class="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-700 transition hover:bg-blue-100"
                  @click="viewMore(device)"
                  aria-label="Xem chi tiết"
                >
                  <EyeIcon class="h-4 w-4" />
                </button>

                <button
                  type="button"
                  class="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600 transition hover:bg-slate-200"
                  @click="startEdit(device)"
                  aria-label="Sửa tên"
                >
                  <PencilSquareIcon class="h-4 w-4" />
                </button>

                <button
                  type="button"
                  class="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-red-50 text-red-600 transition hover:bg-red-100"
                  @click="removeDevice(device)"
                  aria-label="Xóa thiết bị"
                >
                  <TrashIcon class="h-4 w-4" />
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div
      class="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-sm text-slate-500"
    >
      <p>
        Hiển thị {{ filteredDevices.length }} / {{ devices.length }} thiết bị
      </p>
    </div>
  </div>
</template>
