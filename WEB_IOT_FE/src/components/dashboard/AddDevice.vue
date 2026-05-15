<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";

import {
  useDeviceStore,
  type DiscoverableDevice,
} from "../../store/deviceStore";

const store = useDeviceStore();

type SearchMode = "wired" | "wifi" | "lpwan";

const mode = ref<SearchMode | null>(null);
const error = ref<string | null>(null);
const noticeVisible = ref(false);

const loadingWired = ref(false);
const wiredDevices = ref<DiscoverableDevice[]>([]);

const loadingWifi = ref(false);
const wifiDevices = ref<DiscoverableDevice[]>([]);
const selectedWifiDevice = ref<DiscoverableDevice | null>(null);
const wifiDeviceName = ref("");
const wifiActivationCode = ref("");

const loadingLpwan = ref(false);
const lpwanDevices = ref<DiscoverableDevice[]>([]);
const selectedLpwanDevice = ref<DiscoverableDevice | null>(null);
const lpwanDeviceName = ref("");
const lpwanActivationCode = ref("");
const busyConnectLpwanDevEui = ref<string | null>(null);

const busyConnectWiredUid = ref<string | null>(null);
const busyConnectWifiUid = ref<string | null>(null);

let noticeTimer: number | null = null;

const noticeTitle = computed(() => {
  if (error.value) return "Could not connect device";
  if (mode.value === "lpwan") return "LPWAN device claimed";
  return "Device connected";
});

const noticeBody = computed(() => {
  if (error.value) return error.value;

  if (mode.value === "lpwan") {
    return "LPWAN device has been claimed. Uplink telemetry will continue through the simulated LoRaWAN gateway.";
  }

  return "Once the device starts sending MQTT telemetry, it will appear as ONLINE.";
});

function showNotice(ms = 3000) {
  noticeVisible.value = true;

  if (noticeTimer) window.clearTimeout(noticeTimer);

  noticeTimer = window.setTimeout(() => {
    noticeVisible.value = false;
  }, ms);
}

function showError(message: string, ms = 3000) {
  error.value = message;
  showNotice(ms);
}

function showSuccess(ms = 3000) {
  error.value = null;
  showNotice(ms);
}

onBeforeUnmount(() => {
  if (noticeTimer) window.clearTimeout(noticeTimer);
});

async function loadWired() {
  if (loadingWired.value) return;

  loadingWired.value = true;
  error.value = null;

  try {
    wiredDevices.value = await store.discoverDevices({ method: "wired" });
  } catch (err) {
    showError(
      err instanceof Error ? err.message : "Failed to discover wired devices",
      3000,
    );
  } finally {
    loadingWired.value = false;
  }
}

async function loadWifi() {
  if (loadingWifi.value) return;

  loadingWifi.value = true;
  error.value = null;

  try {
    wifiDevices.value = await store.discoverDevices({ method: "wifi" });
  } catch (err) {
    showError(
      err instanceof Error ? err.message : "Failed to discover Wi-Fi devices",
      3000,
    );
  } finally {
    loadingWifi.value = false;
  }
}

async function loadLpwan() {
  if (loadingLpwan.value) return;

  loadingLpwan.value = true;
  error.value = null;

  try {
    lpwanDevices.value = await store.discoverDevices({ method: "lpwan" });
  } catch (err) {
    showError(
      err instanceof Error ? err.message : "Failed to discover LPWAN devices",
      3000,
    );
  } finally {
    loadingLpwan.value = false;
  }
}

async function chooseWired() {
  mode.value = "wired";
  selectedWifiDevice.value = null;
  selectedLpwanDevice.value = null;
  await loadWired();
}

async function chooseLpwan() {
  mode.value = "lpwan";
  selectedWifiDevice.value = null;
  selectedLpwanDevice.value = null;
  lpwanDeviceName.value = "";
  lpwanActivationCode.value = "";
  await loadLpwan();
}

function startWifiConnect(d: DiscoverableDevice) {
  if (!canClaimDevice(d)) return;

  selectedWifiDevice.value = d;
  wifiDeviceName.value = (d.name ?? "").trim() || "";
  wifiActivationCode.value = "";
}

function startLpwanConnect(d: DiscoverableDevice) {
  if (!canClaimDevice(d)) return;

  selectedLpwanDevice.value = d;
  lpwanDeviceName.value = (d.name ?? "").trim() || "";
  lpwanActivationCode.value = "";
}

async function connectWired(d: DiscoverableDevice) {
  if (!d?.deviceUid) return;
  if (!canClaimDevice(d)) return;
  if (busyConnectWiredUid.value) return;

  busyConnectWiredUid.value = d.deviceUid;
  error.value = null;

  try {
    await store.claimWiredDevice({ deviceUid: d.deviceUid });
    showSuccess(3000);
    await loadWired();
  } catch (err) {
    showError(
      err instanceof Error ? err.message : "Failed to connect device",
      3000,
    );
  } finally {
    busyConnectWiredUid.value = null;
  }
}

async function connectWifi() {
  const d = selectedWifiDevice.value;
  if (!d?.deviceUid) return;
  if (!canClaimDevice(d)) return;
  if (busyConnectWifiUid.value) return;

  busyConnectWifiUid.value = d.deviceUid;
  error.value = null;

  try {
    await store.claimWifiDevice({
      deviceUid: d.deviceUid,
      name: wifiDeviceName.value,
      activationCode: wifiActivationCode.value,
    });

    showSuccess(3000);

    selectedWifiDevice.value = null;
    wifiDeviceName.value = "";
    wifiActivationCode.value = "";

    await loadWifi();
  } catch (err) {
    showError(
      err instanceof Error ? err.message : "Failed to connect device",
      3000,
    );
  } finally {
    busyConnectWifiUid.value = null;
  }
}

async function connectLpwan() {
  const d = selectedLpwanDevice.value;
  if (!d?.devEui) return;
  if (!canClaimDevice(d)) return;
  if (busyConnectLpwanDevEui.value) return;

  busyConnectLpwanDevEui.value = d.devEui;
  error.value = null;

  try {
    await store.claimLpwanDevice({
      devEui: d.devEui,
      name: lpwanDeviceName.value,
      activationCode: lpwanActivationCode.value,
    });

    showSuccess(3500);

    selectedLpwanDevice.value = null;
    lpwanDeviceName.value = "";
    lpwanActivationCode.value = "";

    await loadLpwan();
  } catch (err) {
    showError(
      err instanceof Error ? err.message : "Failed to claim LPWAN device",
      3500,
    );
  } finally {
    busyConnectLpwanDevEui.value = null;
  }
}

function statusClass(status: string) {
  if (status === "ONLINE") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }

  if (status === "WARNING") {
    return "bg-amber-50 text-amber-700 ring-amber-200";
  }

  return "bg-slate-100 text-slate-600 ring-slate-200";
}

function signalStatusText(status: string) {
  if (status === "ONLINE") return "Có tín hiệu";
  if (status === "WARNING") return "Cảnh báo";
  return "Chờ kết nối";
}

function claimStatusClass(d: DiscoverableDevice) {
  if (d.claimedByOtherUser) {
    return "bg-red-50 text-red-700 ring-red-200";
  }

  if (d.claimedByCurrentUser) {
    return "bg-blue-50 text-blue-700 ring-blue-200";
  }

  return "bg-emerald-50 text-emerald-700 ring-emerald-200";
}

function claimStatusText(d: DiscoverableDevice) {
  if (d.claimedByOtherUser) return "Đã kết nối bởi tài khoản khác";
  if (d.claimedByCurrentUser) return "Đã có trong hệ thống của bạn";
  return "Có thể kết nối";
}

function canClaimDevice(d: DiscoverableDevice) {
  return (
    d.claimable !== false && !d.claimedByOtherUser && !d.claimedByCurrentUser
  );
}

function actionText(d: DiscoverableDevice, defaultText: string) {
  if (d.claimedByOtherUser) return "Unavailable";
  if (d.claimedByCurrentUser) return "Connected";
  return defaultText;
}
</script>

<template>
  <div class="mx-auto w-full max-w-6xl space-y-6">
    <section class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div
        class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"
      >
        <div>
          <p class="text-sm font-bold uppercase tracking-wider text-blue-600">
            Device Registration
          </p>
          <h2 class="mt-1 text-2xl font-black tracking-tight text-slate-900">
            Thêm thiết bị
          </h2>
          <p class="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
            Chọn phương thức kết nối để tìm thiết bị khả dụng. Thiết bị đã thuộc
            tài khoản khác vẫn hiển thị trong danh sách, nhưng không thể kết nối
            lại.
          </p>
        </div>
      </div>

      <div
        v-if="noticeVisible"
        class="mt-6 rounded-2xl border px-4 py-3"
        :class="
          error
            ? 'border-red-200 bg-red-50'
            : mode === 'lpwan'
              ? 'border-blue-200 bg-blue-50'
              : 'border-emerald-200 bg-emerald-50'
        "
      >
        <p
          class="text-sm font-bold"
          :class="
            error
              ? 'text-red-700'
              : mode === 'lpwan'
                ? 'text-blue-800'
                : 'text-emerald-800'
          "
        >
          {{ noticeTitle }}
        </p>
        <p
          class="mt-1 text-sm"
          :class="
            error
              ? 'text-red-600'
              : mode === 'lpwan'
                ? 'text-blue-700'
                : 'text-emerald-700'
          "
        >
          {{ noticeBody }}
        </p>
      </div>
    </section>

    <section class="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <button
        type="button"
        class="rounded-2xl border bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        :class="
          mode === 'wired'
            ? 'border-blue-300 ring-4 ring-blue-50'
            : 'border-slate-200 hover:border-blue-200'
        "
        @click="chooseWired"
      >
        <div class="flex items-center justify-between gap-3">
          <div
            class="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-700"
          >
            <span class="text-lg font-black">W</span>
          </div>

          <span
            v-if="mode === 'wired'"
            class="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700 ring-1 ring-inset ring-blue-200"
          >
            Selected
          </span>
        </div>

        <p class="mt-4 text-base font-bold text-slate-900">Find via cable</p>
        <p class="mt-2 text-sm leading-6 text-slate-500">
          Hiển thị thiết bị kết nối trực tiếp bằng Ethernet/cable.
        </p>
      </button>
      <!-- Nút add thiết bị wifi -->
      <!-- <button
        type="button"
        class="rounded-2xl border bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        :class="
          mode === 'wifi'
            ? 'border-blue-300 ring-4 ring-blue-50'
            : 'border-slate-200 hover:border-blue-200'
        "
        @click="chooseWifi"
      >
        <div class="flex items-center justify-between gap-3">
          <div
            class="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700"
          >
            <span class="text-lg font-black">Wi</span>
          </div>

          <span
            v-if="mode === 'wifi'"
            class="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700 ring-1 ring-inset ring-blue-200"
          >
            Selected
          </span>
        </div>

        <p class="mt-4 text-base font-bold text-slate-900">Find on Wi-Fi</p>
        <p class="mt-2 text-sm leading-6 text-slate-500">
          Tìm các thiết bị đang nằm trong cùng mạng Wi-Fi.
        </p>
      </button> -->

      <button
        type="button"
        class="rounded-2xl border bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        :class="
          mode === 'lpwan'
            ? 'border-blue-400 ring-4 ring-blue-50'
            : 'border-slate-200 hover:border-blue-200'
        "
        @click="chooseLpwan"
      >
        <div class="flex items-center justify-between gap-3">
          <div
            class="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-50 text-violet-700"
          >
            <span class="text-lg font-black">LP</span>
          </div>

          <span
            v-if="mode === 'lpwan'"
            class="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-bold text-violet-700 ring-1 ring-inset ring-violet-200"
          >
            Selected
          </span>
        </div>

        <p class="mt-4 text-base font-bold text-slate-900">Add LPWAN device</p>
        <p class="mt-2 text-sm leading-6 text-slate-500">
          Claim thiết bị LoRaWAN-like bằng DevEUI và activation code.
        </p>
      </button>
    </section>

    <section
      v-if="mode === 'wired'"
      class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
    >
      <div class="border-b border-slate-100 px-5 py-4">
        <div class="flex items-center justify-between gap-3">
          <div>
            <h3 class="text-base font-bold text-slate-900">Wired devices</h3>
            <p class="mt-1 text-sm text-slate-500">
              Thiết bị có thể được claim nếu chưa thuộc tài khoản nào.
            </p>
          </div>

          <button
            type="button"
            class="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            :disabled="loadingWired"
            @click="loadWired"
          >
            {{ loadingWired ? "Refreshing…" : "Refresh" }}
          </button>
        </div>
      </div>

      <div class="p-5">
        <p v-if="loadingWired" class="text-sm text-slate-500">Scanning…</p>

        <p
          v-else-if="wiredDevices.length === 0"
          class="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500"
        >
          No wired devices found.
        </p>

        <ul v-else class="space-y-3">
          <li
            v-for="d in wiredDevices"
            :key="d.id"
            class="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <div class="flex flex-wrap items-center gap-2">
                <p class="text-sm font-bold text-slate-900">
                  {{ d.name || d.type }}
                </p>

                <span
                  class="rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset"
                  :class="statusClass(d.status)"
                >
                  {{ signalStatusText(d.status) }}
                </span>

                <span
                  class="rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset"
                  :class="claimStatusClass(d)"
                >
                  {{ claimStatusText(d) }}
                </span>
              </div>

              <p class="mt-1 text-xs text-slate-500">
                {{ d.deviceUid }} · {{ d.model }}
              </p>
            </div>

            <button
              type="button"
              class="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
              :disabled="
                !canClaimDevice(d) || busyConnectWiredUid === d.deviceUid
              "
              @click="connectWired(d)"
            >
              {{
                actionText(
                  d,
                  busyConnectWiredUid === d.deviceUid
                    ? "Connecting…"
                    : "Connect",
                )
              }}
            </button>
          </li>
        </ul>
      </div>
    </section>

    <section
      v-else-if="mode === 'wifi'"
      class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
    >
      <div class="border-b border-slate-100 px-5 py-4">
        <div class="flex items-center justify-between gap-3">
          <div>
            <h3 class="text-base font-bold text-slate-900">Wi-Fi devices</h3>
            <p class="mt-1 text-sm text-slate-500">
              Select a discovered Wi-Fi device and enter its activation code.
            </p>
          </div>

          <button
            type="button"
            class="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            :disabled="loadingWifi"
            @click="loadWifi"
          >
            {{ loadingWifi ? "Refreshing…" : "Refresh" }}
          </button>
        </div>
      </div>

      <div class="p-5">
        <p v-if="loadingWifi" class="text-sm text-slate-500">Scanning…</p>

        <p
          v-else-if="wifiDevices.length === 0"
          class="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500"
        >
          No Wi-Fi devices found.
        </p>

        <ul v-else class="space-y-3">
          <li
            v-for="d in wifiDevices"
            :key="d.id"
            class="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4"
          >
            <div
              class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <div class="flex flex-wrap items-center gap-2">
                  <p class="text-sm font-bold text-slate-900">
                    {{ d.name || d.type }}
                  </p>

                  <span
                    class="rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset"
                    :class="statusClass(d.status)"
                  >
                    {{ signalStatusText(d.status) }}
                  </span>

                  <span
                    class="rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset"
                    :class="claimStatusClass(d)"
                  >
                    {{ claimStatusText(d) }}
                  </span>
                </div>

                <p class="mt-1 text-xs text-slate-500">
                  {{ d.deviceUid }} · {{ d.model }}
                </p>
              </div>

              <button
                type="button"
                class="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                :disabled="!canClaimDevice(d)"
                @click="startWifiConnect(d)"
              >
                {{ actionText(d, "Connect") }}
              </button>
            </div>

            <div
              v-if="selectedWifiDevice?.deviceUid === d.deviceUid"
              class="mt-4 rounded-2xl border border-slate-200 bg-white p-4"
            >
              <p class="text-sm font-bold text-slate-900">Enter device info</p>

              <form class="mt-4 space-y-4" @submit.prevent="connectWifi">
                <div>
                  <label class="text-sm font-semibold text-slate-700">
                    Device name
                  </label>
                  <input
                    v-model="wifiDeviceName"
                    required
                    type="text"
                    placeholder="e.g. Living Room Sensor"
                    class="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
                  />
                </div>

                <div>
                  <label class="text-sm font-semibold text-slate-700">
                    Activation code
                  </label>
                  <input
                    v-model="wifiActivationCode"
                    required
                    type="text"
                    autocomplete="one-time-code"
                    placeholder="e.g. XYZ789"
                    class="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
                  />
                </div>

                <div class="flex items-center justify-end gap-3 pt-1">
                  <button
                    type="button"
                    class="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
                    @click="selectedWifiDevice = null"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    :disabled="busyConnectWifiUid === d.deviceUid"
                    class="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition enabled:hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                  >
                    {{
                      busyConnectWifiUid === d.deviceUid
                        ? "Connecting…"
                        : "Connect"
                    }}
                  </button>
                </div>
              </form>
            </div>
          </li>
        </ul>
      </div>
    </section>

    <section
      v-else-if="mode === 'lpwan'"
      class="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm"
    >
      <div class="border-b border-blue-100 bg-blue-50/40 px-5 py-4">
        <div class="flex items-center justify-between gap-3">
          <div>
            <h3 class="text-base font-bold text-slate-900">
              LoRaWAN-like devices
            </h3>
            <p class="mt-1 text-sm text-slate-500">
              Devices first join the simulated LPWAN network, then users claim
              ownership with activation code.
            </p>
          </div>

          <button
            type="button"
            class="inline-flex items-center justify-center rounded-xl border border-blue-200 bg-white px-4 py-2 text-sm font-bold text-blue-700 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
            :disabled="loadingLpwan"
            @click="loadLpwan"
          >
            {{ loadingLpwan ? "Refreshing…" : "Refresh" }}
          </button>
        </div>
      </div>

      <div class="p-5">
        <p v-if="loadingLpwan" class="text-sm text-slate-500">
          Scanning LoRaWAN uplinks…
        </p>

        <p
          v-else-if="lpwanDevices.length === 0"
          class="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500"
        >
          No LPWAN devices found. Run
          <span class="font-mono font-semibold">npm run sim:lpwan</span>
          first, then click Refresh.
        </p>

        <ul v-else class="space-y-3">
          <li
            v-for="d in lpwanDevices"
            :key="d.id"
            class="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4"
          >
            <div
              class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"
            >
              <div>
                <div class="flex flex-wrap items-center gap-2">
                  <p class="text-sm font-bold text-slate-900">
                    {{ d.name || d.type }}
                  </p>

                  <span
                    class="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-bold text-violet-700 ring-1 ring-inset ring-violet-200"
                  >
                    {{ d.networkType || "LORAWAN" }}
                  </span>

                  <span
                    class="rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset"
                    :class="statusClass(d.status)"
                  >
                    {{ signalStatusText(d.status) }}
                  </span>

                  <span
                    class="rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset"
                    :class="claimStatusClass(d)"
                  >
                    {{ claimStatusText(d) }}
                  </span>
                </div>

                <p class="mt-2 text-xs text-slate-500">
                  DevEUI: {{ d.devEui || "—" }}
                </p>

                <p class="mt-1 text-xs text-slate-500">
                  Gateway: {{ d.gatewayId || "—" }}
                  <span v-if="d.lastRssi !== null && d.lastRssi !== undefined">
                    · RSSI {{ Math.round(d.lastRssi) }} dBm
                  </span>
                  <span v-if="d.lastSnr !== null && d.lastSnr !== undefined">
                    · SNR {{ d.lastSnr }} dB
                  </span>
                  <span v-if="d.lastSpreadingFactor">
                    · SF{{ d.lastSpreadingFactor }}
                  </span>
                  <span
                    v-if="
                      d.lastBatteryPct !== null &&
                      d.lastBatteryPct !== undefined
                    "
                  >
                    · Battery {{ Math.round(d.lastBatteryPct) }}%
                  </span>
                </p>

                <p class="mt-1 text-xs text-slate-400">
                  Join status: {{ d.joinStatus || "UNCLAIMED" }}
                </p>
              </div>

              <button
                type="button"
                class="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                :disabled="!d.devEui || !canClaimDevice(d)"
                @click="startLpwanConnect(d)"
              >
                {{ actionText(d, "Claim") }}
              </button>
            </div>

            <div
              v-if="selectedLpwanDevice?.id === d.id"
              class="mt-4 rounded-2xl border border-slate-200 bg-white p-4"
            >
              <p class="text-sm font-bold text-slate-900">Claim LPWAN device</p>

              <form class="mt-4 space-y-4" @submit.prevent="connectLpwan">
                <div>
                  <label class="text-sm font-semibold text-slate-700">
                    Device name
                  </label>
                  <input
                    v-model="lpwanDeviceName"
                    required
                    type="text"
                    placeholder="e.g. LoRa Temp Sensor 01"
                    class="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
                  />
                </div>

                <div>
                  <label class="text-sm font-semibold text-slate-700">
                    Activation code
                  </label>
                  <input
                    v-model="lpwanActivationCode"
                    required
                    type="text"
                    autocomplete="one-time-code"
                    placeholder="e.g. ABC123"
                    class="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
                  />
                </div>

                <div
                  class="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3"
                >
                  <p class="text-sm font-bold text-blue-900">
                    LoRaWAN-like flow
                  </p>
                  <p class="mt-1 text-sm leading-6 text-blue-700">
                    This device has already joined the simulated LPWAN network
                    through gateway uplinks. Claiming only associates it with
                    your account.
                  </p>
                </div>

                <div class="flex items-center justify-end gap-3 pt-1">
                  <button
                    type="button"
                    class="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
                    @click="selectedLpwanDevice = null"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    :disabled="busyConnectLpwanDevEui === d.devEui"
                    class="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition enabled:hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                  >
                    {{
                      busyConnectLpwanDevEui === d.devEui
                        ? "Claiming…"
                        : "Claim LPWAN device"
                    }}
                  </button>
                </div>
              </form>
            </div>
          </li>
        </ul>
      </div>
    </section>
  </div>
</template>
