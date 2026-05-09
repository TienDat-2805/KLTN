<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";

import {
  Bars3Icon,
  BellIcon,
  ChevronDownIcon,
  MagnifyingGlassIcon,
  UserCircleIcon,
  Cog6ToothIcon,
  ArrowRightOnRectangleIcon,
} from "@heroicons/vue/24/outline";

import { useAuthStore } from "../../store/authStore";
import { useDeviceStore } from "../../store/deviceStore";
import { formatRelativeTime } from "../../lib/time";

const emit = defineEmits<{
  (e: "toggleSidebar"): void;
}>();

const route = useRoute();
const router = useRouter();

const auth = useAuthStore();
const devices = useDeviceStore();

const isUserMenuOpen = ref(false);
const isNotificationsOpen = ref(false);

const resolvedTitle = computed(() => {
  const metaTitle = route.meta?.title as string | undefined;
  return metaTitle ?? "Tổng quan";
});

const userLabel = computed(() => {
  const fullName = auth.user?.fullName?.trim();
  if (fullName) return fullName;

  const email = auth.user?.email;
  if (!email) return "Người dùng";
  return email.split("@")[0] || "Người dùng";
});

const userInitial = computed(() => {
  const label = userLabel.value.trim();
  return label ? label.charAt(0).toUpperCase() : "U";
});

const notifications = computed(() => {
  void devices.relativeTimeTick;
  return devices.notifications.map((n) => ({
    ...n,
    relative: formatRelativeTime(n.ts),
  }));
});

function toggleUserMenu() {
  isNotificationsOpen.value = false;
  isUserMenuOpen.value = !isUserMenuOpen.value;
}

function toggleNotifications() {
  isUserMenuOpen.value = false;
  isNotificationsOpen.value = !isNotificationsOpen.value;
}

function onGlobalPointerDown(e: PointerEvent) {
  const target = e.target;
  if (!(target instanceof HTMLElement)) return;
  if (
    target.closest("[data-user-menu]") ||
    target.closest("[data-notifications]")
  )
    return;
  isUserMenuOpen.value = false;
  isNotificationsOpen.value = false;
}

onMounted(() => {
  window.addEventListener("pointerdown", onGlobalPointerDown);
});

onBeforeUnmount(() => {
  window.removeEventListener("pointerdown", onGlobalPointerDown);
});

function goTo(path: string) {
  isUserMenuOpen.value = false;
  isNotificationsOpen.value = false;
  router.push(path);
}

function logout() {
  isUserMenuOpen.value = false;
  isNotificationsOpen.value = false;
  auth.logout();
  router.push("/login");
}
</script>

<template>
  <header class="sticky top-0 z-30 border-b border-slate-200 bg-white">
    <div
      class="flex min-h-[64px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8"
    >
      <div class="flex min-w-0 items-center gap-3">
        <button
          type="button"
          class="inline-flex items-center rounded-lg border border-slate-200 bg-white p-2 text-slate-700 transition hover:bg-slate-50 lg:hidden"
          @click="emit('toggleSidebar')"
          aria-label="Mở menu"
        >
          <Bars3Icon class="h-5 w-5" />
        </button>

        <div class="min-w-0">
          <p
            class="text-[11px] font-bold uppercase tracking-wider text-slate-400"
          >
            IoT Management
          </p>
          <h1 class="truncate text-lg font-bold text-slate-900">
            {{ resolvedTitle }}
          </h1>
        </div>
      </div>

      <div class="hidden flex-1 justify-center px-4 md:flex">
        <div class="relative w-full max-w-md">
          <MagnifyingGlassIcon
            class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          />
          <input
            type="search"
            placeholder="Tìm thiết bị, UID, trạng thái..."
            class="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-50"
          />
        </div>
      </div>

      <div class="flex items-center justify-end gap-2 sm:gap-3">
        <div class="relative" data-notifications>
          <button
            type="button"
            class="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50"
            aria-label="Thông báo"
            @pointerdown.stop
            @click.stop="toggleNotifications"
          >
            <BellIcon class="h-5 w-5" />
            <span
              v-if="notifications.length"
              class="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white"
            />
          </button>

          <div
            v-if="isNotificationsOpen"
            class="absolute right-0 z-50 mt-2 w-[320px] overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-xl"
            @pointerdown.stop
            @click.stop
          >
            <div
              class="flex items-center justify-between border-b border-slate-100 px-4 py-3"
            >
              <p class="text-sm font-bold text-slate-900">Thông báo thiết bị</p>
              <span
                class="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-600"
              >
                {{ notifications.length }}
              </span>
            </div>

            <div class="max-h-80 overflow-auto">
              <div
                v-if="notifications.length === 0"
                class="px-4 py-6 text-center text-sm text-slate-500"
              >
                Chưa có thông báo mới.
              </div>

              <div v-else>
                <div
                  v-for="n in notifications.slice(0, 12)"
                  :key="n.id"
                  class="border-b border-slate-50 px-4 py-3 transition last:border-b-0 hover:bg-slate-50"
                >
                  <p class="text-sm font-semibold text-slate-900">
                    {{ n.title }}
                  </p>
                  <p
                    v-if="n.message"
                    class="mt-0.5 line-clamp-2 text-sm text-slate-500"
                  >
                    {{ n.message }}
                  </p>
                  <p class="mt-1 text-xs font-medium text-slate-400">
                    {{ n.relative }}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="relative" data-user-menu>
          <button
            type="button"
            class="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white py-1.5 pl-1.5 pr-2 text-slate-700 transition hover:bg-slate-50"
            @click="toggleUserMenu"
            aria-label="Menu người dùng"
          >
            <div
              class="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white"
            >
              {{ userInitial }}
            </div>
            <span
              class="hidden max-w-32 truncate text-sm font-semibold text-slate-800 sm:block"
            >
              {{ userLabel }}
            </span>
            <ChevronDownIcon class="h-4 w-4 text-slate-400" />
          </button>

          <div
            v-if="isUserMenuOpen"
            class="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-xl"
          >
            <div class="border-b border-slate-100 px-4 py-3">
              <p class="truncate text-sm font-bold text-slate-900">
                {{ userLabel }}
              </p>
              <p class="truncate text-xs text-slate-400">
                {{ auth.user?.email || "Tài khoản hệ thống" }}
              </p>
            </div>

            <button
              type="button"
              class="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-slate-700 transition hover:bg-slate-50"
              @click="goTo('/app/settings')"
            >
              <UserCircleIcon class="h-4 w-4 text-slate-400" />
              Thông tin cá nhân
            </button>

            <button
              type="button"
              class="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-slate-700 transition hover:bg-slate-50"
              @click="goTo('/app/settings')"
            >
              <Cog6ToothIcon class="h-4 w-4 text-slate-400" />
              Cài đặt
            </button>

            <button
              type="button"
              class="flex w-full items-center gap-2 border-t border-slate-100 px-4 py-2.5 text-left text-sm font-semibold text-red-500 transition hover:bg-red-50"
              @click="logout"
            >
              <ArrowRightOnRectangleIcon class="h-4 w-4" />
              Đăng xuất
            </button>
          </div>
        </div>
      </div>
    </div>
  </header>
</template>
