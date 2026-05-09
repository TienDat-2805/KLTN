<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";

import { useAuthStore } from "../../store/authStore";

import {
  HomeIcon,
  CpuChipIcon,
  PlusCircleIcon,
  Cog6ToothIcon,
  ArrowRightOnRectangleIcon,
  ChartBarSquareIcon,
  XMarkIcon,
} from "@heroicons/vue/24/outline";

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const primaryNav = [
  { label: "Tổng quan", to: "/app/dashboard", icon: HomeIcon },
  { label: "Quản lý thiết bị", to: "/app/devices", icon: CpuChipIcon },
  { label: "Thêm thiết bị", to: "/app/add-device", icon: PlusCircleIcon },
  { label: "Cài đặt tài khoản", to: "/app/settings", icon: Cog6ToothIcon },
];

const userName = computed(
  () => auth.user?.fullName || auth.user?.email || "Người dùng",
);

function isActive(to: string) {
  if (to === "/app/devices")
    return route.path === to || route.path.startsWith("/app/devices/");
  return route.path === to;
}

function logout() {
  auth.logout();
  emit("close");
  router.push("/login");
}
</script>

<template>
  <div
    v-show="props.open"
    class="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-[1px] lg:hidden"
    @click="emit('close')"
    aria-hidden="true"
  />

  <aside
    :class="[
      'fixed left-0 top-0 z-50 h-full w-[260px] transform border-r border-slate-200 bg-white text-slate-700 shadow-sm transition duration-200 lg:translate-x-0',
      props.open ? 'translate-x-0' : '-translate-x-full',
    ]"
  >
    <div class="flex h-full flex-col">
      <div
        class="flex items-center justify-between border-b border-slate-100 px-5 py-4"
      >
        <RouterLink
          to="/"
          class="flex items-center gap-2"
          @click="emit('close')"
        >
          <div
            class="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm"
          >
            <ChartBarSquareIcon class="h-5 w-5" />
          </div>
          <div class="leading-tight">
            <div class="text-base font-bold tracking-tight text-slate-900">
              <span class="text-blue-600">IoT</span> Admin
            </div>
            <div class="text-[11px] font-medium text-slate-400">
              Device Management
            </div>
          </div>
        </RouterLink>

        <button
          type="button"
          class="inline-flex rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 lg:hidden"
          @click="emit('close')"
          aria-label="Đóng menu"
        >
          <XMarkIcon class="h-5 w-5" />
        </button>
      </div>

      <div class="border-b border-slate-100 px-5 py-4">
        <div class="rounded-2xl bg-slate-50 px-4 py-3">
          <p
            class="text-[11px] font-semibold uppercase tracking-wide text-slate-400"
          >
            Tài khoản
          </p>
          <p class="mt-1 truncate text-sm font-semibold text-slate-800">
            {{ userName }}
          </p>
          <p class="mt-1 text-xs text-blue-600">Quản trị hệ thống IoT</p>
        </div>
      </div>

      <nav class="flex-1 px-3 py-4">
        <p
          class="px-3 pb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400"
        >
          Điều hướng
        </p>

        <div class="space-y-1">
          <RouterLink
            v-for="item in primaryNav"
            :key="item.label"
            :to="item.to"
            class="group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition"
            :class="
              isActive(item.to)
                ? 'bg-blue-50 text-blue-700'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            "
            @click="emit('close')"
          >
            <component
              :is="item.icon"
              class="h-5 w-5 transition"
              :class="
                isActive(item.to)
                  ? 'text-blue-600'
                  : 'text-slate-400 group-hover:text-slate-700'
              "
            />
            <span>{{ item.label }}</span>
          </RouterLink>
        </div>
      </nav>

      <div class="border-t border-slate-100 px-3 py-4">
        <button
          type="button"
          class="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-red-500 transition hover:bg-red-50"
          @click="logout"
        >
          <ArrowRightOnRectangleIcon class="h-5 w-5" />
          <span>Đăng xuất</span>
        </button>
      </div>
    </div>
  </aside>
</template>
