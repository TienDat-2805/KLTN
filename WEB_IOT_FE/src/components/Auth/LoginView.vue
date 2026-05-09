<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";

import { useAuthStore } from "../../store/authStore";

const router = useRouter();
const auth = useAuthStore();

const email = ref("");
const password = ref("");
const rememberMe = ref(true);

onMounted(() => {
  const remembered = auth.getRememberedEmail();
  if (remembered) {
    email.value = remembered;
    rememberMe.value = true;
  }
});

async function submit() {
  const ok = await auth.login(email.value, password.value, rememberMe.value);
  auth.setRememberedEmail(rememberMe.value ? email.value : null);
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
              Dashboard
            </p>
            <h1 class="mt-4 text-4xl font-bold leading-tight">
              Quản lý thiết bị IoT và telemetry trên một hệ thống tập trung.
            </h1>
            <p class="mt-5 text-sm leading-7 text-blue-50">
              Theo dõi trạng thái thiết bị, dữ liệu cảm biến, cảnh báo và kết
              nối LPWAN theo thời gian thực. Giao diện được tối ưu cho vận hành
              và báo cáo hệ thống.
            </p>
          </div>

          <div class="mt-16 grid grid-cols-3 gap-3">
            <div class="rounded-2xl bg-white/10 p-4 backdrop-blur">
              <p class="text-2xl font-bold">24/7</p>
              <p class="mt-1 text-xs text-blue-100">Monitoring</p>
            </div>
            <div class="rounded-2xl bg-white/10 p-4 backdrop-blur">
              <p class="text-2xl font-bold">MQTT</p>
              <p class="mt-1 text-xs text-blue-100">Realtime</p>
            </div>
            <div class="rounded-2xl bg-white/10 p-4 backdrop-blur">
              <p class="text-2xl font-bold">LPWAN</p>
              <p class="mt-1 text-xs text-blue-100">Ready</p>
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
                  Đăng nhập
                </h1>
                <p class="mt-2 text-sm text-slate-500">
                  Vui lòng nhập email và mật khẩu để tiếp tục.
                </p>
              </div>

              <form class="mt-7 space-y-4" @submit.prevent="submit">
                <div class="space-y-2">
                  <label class="text-sm font-semibold text-slate-700"
                    >Email</label
                  >
                  <input
                    name="email"
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
                    name="password"
                    type="password"
                    autocomplete="current-password"
                    required
                    v-model="password"
                    class="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-50"
                    placeholder="••••••••"
                  />
                </div>

                <div class="flex items-center justify-between">
                  <label
                    class="inline-flex items-center gap-2 text-sm text-slate-500"
                  >
                    <input
                      v-model="rememberMe"
                      type="checkbox"
                      class="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    Nhớ mật khẩu
                  </label>

                  <a
                    href="#"
                    class="text-sm font-semibold text-slate-500 transition hover:text-blue-600"
                  >
                    Quên mật khẩu?
                  </a>
                </div>

                <button
                  type="submit"
                  :disabled="auth.loading"
                  class="h-11 w-full rounded-lg bg-blue-600 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                >
                  {{ auth.loading ? "Đang đăng nhập..." : "Đăng nhập" }}
                </button>

                <p
                  v-if="auth.error"
                  class="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-600"
                >
                  {{ auth.error }}
                </p>
              </form>

              <p class="mt-6 text-center text-sm text-slate-500">
                Bạn chưa có tài khoản?
                <RouterLink
                  to="/signup"
                  class="font-bold text-blue-600 hover:underline"
                >
                  Tạo tài khoản
                </RouterLink>
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  </div>
</template>
