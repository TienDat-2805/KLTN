<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";

import {
  ExclamationTriangleIcon,
  KeyIcon,
  ShieldCheckIcon,
  UserCircleIcon,
} from "@heroicons/vue/24/outline";

import { useAuthStore } from "../../store/authStore";

const router = useRouter();
const auth = useAuthStore();

const fullName = ref(auth.user?.fullName ?? "");
const savingProfile = ref(false);

const currentPassword = ref("");
const newPassword = ref("");
const confirmPassword = ref("");
const savingPassword = ref(false);

const passwordMismatch = computed(() => {
  if (!newPassword.value && !confirmPassword.value) return false;
  return newPassword.value !== confirmPassword.value;
});

async function saveProfile() {
  auth.clearError();

  const name = fullName.value.trim();

  if (!name) {
    auth.setError("Full name is required");
    return;
  }

  savingProfile.value = true;

  try {
    const ok = await auth.updateFullName(name);
    if (!ok) return;
  } finally {
    savingProfile.value = false;
  }
}

async function savePassword() {
  auth.clearError();

  if (!currentPassword.value || !newPassword.value) {
    auth.setError("Please enter current and new password");
    return;
  }

  if (newPassword.value.length < 6) {
    auth.setError("Password must be at least 6 characters");
    return;
  }

  if (passwordMismatch.value) {
    auth.setError("New passwords do not match");
    return;
  }

  savingPassword.value = true;

  try {
    const ok = await auth.changePassword(
      currentPassword.value,
      newPassword.value,
    );
    if (!ok) return;

    currentPassword.value = "";
    newPassword.value = "";
    confirmPassword.value = "";
  } finally {
    savingPassword.value = false;
  }
}

async function deleteAccount() {
  const ok = window.confirm(
    "This will permanently delete your account and all devices. Continue?",
  );

  if (!ok) return;

  auth.clearError();

  const deleted = await auth.deleteAccount();
  if (!deleted) return;

  auth.logout();
  router.push("/signup");
}
</script>

<template>
  <div class="mx-auto w-full max-w-4xl space-y-6">
    <section class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div
        class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <p class="text-sm font-bold uppercase tracking-wider text-blue-600">
            Account
          </p>
          <h2 class="mt-1 text-2xl font-black tracking-tight text-slate-900">
            Cài đặt tài khoản
          </h2>
          <p class="mt-1 text-sm text-slate-500">
            Cập nhật thông tin cá nhân, mật khẩu và quyền truy cập hệ thống.
          </p>
        </div>

        <div
          class="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"
        >
          <UserCircleIcon class="h-8 w-8" />
        </div>
      </div>
    </section>

    <p
      v-if="auth.error"
      class="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-600"
    >
      {{ auth.error }}
    </p>

    <section
      class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
    >
      <div class="border-b border-slate-100 px-6 py-4">
        <div class="flex items-center gap-3">
          <div
            class="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600"
          >
            <UserCircleIcon class="h-5 w-5" />
          </div>

          <div>
            <h3 class="text-base font-bold text-slate-900">
              Thông tin cá nhân
            </h3>
            <p class="mt-0.5 text-sm text-slate-500">
              Thay đổi tên hiển thị của tài khoản.
            </p>
          </div>
        </div>
      </div>

      <div class="space-y-5 px-6 py-5">
        <div>
          <label class="text-sm font-semibold text-slate-700">Email</label>
          <input
            :value="auth.user?.email ?? ''"
            disabled
            type="text"
            class="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-500 outline-none"
          />
        </div>

        <div>
          <label class="text-sm font-semibold text-slate-700">Họ tên</label>
          <input
            v-model="fullName"
            required
            type="text"
            placeholder="Nhập họ tên"
            class="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
          />
        </div>

        <div class="flex items-center justify-end">
          <button
            type="button"
            class="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
            :disabled="savingProfile"
            @click="saveProfile"
          >
            {{ savingProfile ? "Đang lưu..." : "Lưu thông tin" }}
          </button>
        </div>
      </div>
    </section>

    <section
      class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
    >
      <div class="border-b border-slate-100 px-6 py-4">
        <div class="flex items-center gap-3">
          <div
            class="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600"
          >
            <KeyIcon class="h-5 w-5" />
          </div>

          <div>
            <h3 class="text-base font-bold text-slate-900">Mật khẩu</h3>
            <p class="mt-0.5 text-sm text-slate-500">
              Cập nhật mật khẩu đăng nhập hệ thống.
            </p>
          </div>
        </div>
      </div>

      <div class="space-y-5 px-6 py-5">
        <div>
          <label class="text-sm font-semibold text-slate-700"
            >Mật khẩu hiện tại</label
          >
          <input
            v-model="currentPassword"
            type="password"
            autocomplete="current-password"
            class="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
          />
        </div>

        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label class="text-sm font-semibold text-slate-700"
              >Mật khẩu mới</label
            >
            <input
              v-model="newPassword"
              type="password"
              autocomplete="new-password"
              class="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
            />
          </div>

          <div>
            <label class="text-sm font-semibold text-slate-700"
              >Xác nhận mật khẩu</label
            >
            <input
              v-model="confirmPassword"
              type="password"
              autocomplete="new-password"
              class="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
            />
          </div>
        </div>

        <p
          v-if="passwordMismatch"
          class="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-600"
        >
          Passwords do not match.
        </p>

        <div class="flex items-center justify-end">
          <button
            type="button"
            class="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
            :disabled="savingPassword"
            @click="savePassword"
          >
            {{ savingPassword ? "Đang lưu..." : "Đổi mật khẩu" }}
          </button>
        </div>
      </div>
    </section>

    <section
      class="overflow-hidden rounded-2xl border border-red-100 bg-white shadow-sm"
    >
      <div class="border-b border-red-100 bg-red-50/40 px-6 py-4">
        <div class="flex items-center gap-3">
          <div
            class="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-600"
          >
            <ExclamationTriangleIcon class="h-5 w-5" />
          </div>

          <div>
            <h3 class="text-base font-bold text-red-700">Xóa tài khoản</h3>
            <p class="mt-0.5 text-sm text-red-500">
              Thao tác này sẽ xóa vĩnh viễn tài khoản và dữ liệu liên quan.
            </p>
          </div>
        </div>
      </div>

      <div
        class="flex flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center sm:justify-between"
      >
        <div class="flex items-start gap-3 text-sm text-slate-600">
          <ShieldCheckIcon class="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
          <p>
            Hãy chắc chắn bạn đã sao lưu dữ liệu cần thiết trước khi xóa tài
            khoản.
          </p>
        </div>

        <button
          type="button"
          class="inline-flex items-center justify-center rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-bold text-red-600 shadow-sm transition hover:bg-red-50"
          @click="deleteAccount"
        >
          Delete account
        </button>
      </div>
    </section>
  </div>
</template>
