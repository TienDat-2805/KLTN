<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";

import { useAuthStore } from "../../store/authStore";

const router = useRouter();
const auth = useAuthStore();

const fullName = ref("");
const email = ref("");
const password = ref("");
const confirmPassword = ref("");

const passwordsMatch = computed(() =>
  Boolean(
    password.value.length &&
    confirmPassword.value.length &&
    password.value === confirmPassword.value,
  ),
);

const passwordsMismatch = computed(() =>
  Boolean(
    confirmPassword.value.length && password.value !== confirmPassword.value,
  ),
);

const canSubmit = computed(() =>
  Boolean(
    fullName.value.trim() &&
    email.value.trim() &&
    passwordsMatch.value &&
    !auth.loading,
  ),
);

async function submit() {
  if (password.value !== confirmPassword.value) {
    auth.setError("Mật khẩu xác nhận không khớp", 3000);
    return;
  }
  const ok = await auth.signup(email.value, password.value, fullName.value);
  if (ok) router.push("/app/dashboard");
}
</script>

<template>
  <div class="min-h-screen bg-[#4f7df3] text-slate-900">
    <div class="pointer-events-none fixed inset-0 overflow-hidden">
      <div
        class="absolute -left-24 top-16 h-72 w-72 rounded-full bg-white/10"
      />
      <div
        class="absolute bottom-10 left-20 h-80 w-80 rounded-full bg-white/10"
      />
      <div
        class="absolute right-32 top-20 h-80 w-80 rounded-full bg-white/10"
      />
      <div
        class="absolute -right-20 bottom-20 h-96 w-96 rounded-full bg-white/10"
      />
    </div>

    <main
      class="relative flex min-h-screen items-center justify-center px-4 py-10"
    >
      <div
        class="grid w-full max-w-6xl overflow-hidden rounded-[28px] bg-white shadow-2xl shadow-blue-950/20 lg:grid-cols-[1.05fr_0.95fr]"
      >
        <section class="hidden bg-blue-600 px-10 py-12 text-white lg:block">
          <RouterLink to="/" class="inline-flex items-center gap-2">
            <div
              class="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-lg font-black text-blue-600"
            >
              I
            </div>
            <div>
              <p class="text-lg font-bold">IoT Admin</p>
              <p class="text-xs text-blue-100">Device Management Platform</p>
            </div>
          </RouterLink>

          <div class="mt-20 max-w-md">
            <p
              class="text-sm font-semibold uppercase tracking-[0.3em] text-blue-100"
            >
              Create account
            </p>
            <h1 class="mt-4 text-4xl font-bold leading-tight">
              Khởi tạo tài khoản để vận hành hệ thống quản lý IoT.
            </h1>
            <p class="mt-5 text-sm leading-7 text-blue-50">
              Tài khoản dùng để quản lý thiết bị, theo dõi telemetry, cấu hình
              kết nối và kiểm tra cảnh báo phát sinh trong quá trình vận hành.
            </p>
          </div>

          <div class="mt-16 rounded-3xl bg-white/10 p-5 backdrop-blur">
            <p class="text-sm font-bold">Luồng sử dụng chính</p>
            <div class="mt-4 space-y-3 text-sm text-blue-50">
              <p>1. Đăng ký / đăng nhập hệ thống.</p>
              <p>2. Thêm hoặc claim thiết bị IoT.</p>
              <p>3. Theo dõi dữ liệu realtime trên dashboard.</p>
            </div>
          </div>
        </section>

        <section
          class="flex items-center justify-center px-5 py-10 sm:px-8 lg:px-12"
        >
          <div class="w-full max-w-md">
            <div class="mb-8 text-center lg:hidden">
              <RouterLink
                to="/"
                class="inline-flex items-center justify-center gap-2"
              >
                <div
                  class="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-lg font-black text-white"
                >
                  I
                </div>
                <span class="text-lg font-bold text-slate-900">IoT Admin</span>
              </RouterLink>
            </div>

            <div
              class="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm sm:p-8"
            >
              <div class="text-center">
                <h1 class="text-2xl font-bold tracking-tight text-slate-900">
                  Đăng ký
                </h1>
                <p class="mt-2 text-sm text-slate-500">
                  Tạo tài khoản mới để tiếp tục.
                </p>
              </div>

              <form class="mt-7 space-y-4" @submit.prevent="submit">
                <div class="space-y-2">
                  <label class="text-sm font-semibold text-slate-700"
                    >Họ tên</label
                  >
                  <input
                    type="text"
                    autocomplete="name"
                    required
                    v-model="fullName"
                    class="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-50"
                    placeholder="Ví dụ: Lê Văn A"
                  />
                </div>

                <div class="space-y-2">
                  <label class="text-sm font-semibold text-slate-700"
                    >Email</label
                  >
                  <input
                    type="email"
                    autocomplete="email"
                    required
                    v-model="email"
                    class="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-50"
                    placeholder="Ví dụ: levana@gmail.com"
                  />
                </div>

                <div class="space-y-2">
                  <label class="text-sm font-semibold text-slate-700"
                    >Mật khẩu</label
                  >
                  <input
                    type="password"
                    autocomplete="new-password"
                    required
                    v-model="password"
                    class="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-50"
                    placeholder="••••••••"
                  />
                </div>

                <div class="space-y-2">
                  <label class="text-sm font-semibold text-slate-700"
                    >Nhập lại mật khẩu</label
                  >
                  <input
                    type="password"
                    autocomplete="new-password"
                    required
                    v-model="confirmPassword"
                    class="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-50"
                    placeholder="••••••••"
                  />
                </div>

                <div class="min-h-5">
                  <p
                    v-if="passwordsMatch"
                    class="text-sm font-medium text-emerald-600"
                  >
                    Mật khẩu khớp.
                  </p>
                  <p
                    v-else-if="passwordsMismatch"
                    class="text-sm font-medium text-red-600"
                  >
                    Mật khẩu xác nhận không khớp.
                  </p>
                </div>

                <button
                  type="submit"
                  :disabled="!canSubmit"
                  class="h-11 w-full rounded-lg bg-blue-600 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                >
                  {{ auth.loading ? "Đang tạo tài khoản..." : "Đăng ký" }}
                </button>

                <p
                  v-if="auth.error"
                  class="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-600"
                >
                  {{ auth.error }}
                </p>
              </form>

              <p class="mt-6 text-center text-sm text-slate-500">
                Bạn đã có tài khoản?
                <RouterLink
                  to="/login"
                  class="font-bold text-blue-600 hover:underline"
                >
                  Đăng nhập
                </RouterLink>
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  </div>
</template>
