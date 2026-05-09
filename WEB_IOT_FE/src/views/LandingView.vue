<script setup lang="ts">
const features = [
  {
    title: "Quản lý thiết bị",
    desc: "Theo dõi danh sách thiết bị, trạng thái online/offline, UID, loại kết nối và thời điểm cập nhật gần nhất.",
  },
  {
    title: "Telemetry realtime",
    desc: "Nhận dữ liệu cảm biến qua MQTT, cập nhật dashboard bằng Socket.IO và lưu trữ dữ liệu phục vụ truy xuất.",
  },
  {
    title: "Hướng LPWAN-ready",
    desc: "Mô phỏng luồng thiết bị LPWAN gửi uplink định kỳ, phù hợp với thiết bị truyền dữ liệu nhỏ trong phạm vi xa.",
  },
];
</script>

<template>
  <div class="min-h-screen bg-[#f4f6fb] text-slate-900">
    <header
      class="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur"
    >
      <div
        class="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8"
      >
        <RouterLink to="/" class="flex items-center gap-2">
          <div
            class="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-lg font-black text-white"
          >
            I
          </div>
          <div>
            <p class="text-lg font-bold leading-none text-slate-900">
              <span class="text-blue-600">IoT</span> Admin
            </p>
            <p class="mt-1 text-xs font-medium text-slate-400">
              Device Management Platform
            </p>
          </div>
        </RouterLink>

        <nav
          class="hidden items-center gap-8 text-sm font-semibold text-slate-600 md:flex"
        >
          <a href="#home" class="transition hover:text-blue-600">Trang chủ</a>
          <a href="#features" class="transition hover:text-blue-600"
            >Tính năng</a
          >
          <a href="#about" class="transition hover:text-blue-600">Kiến trúc</a>
          <a href="#contact" class="transition hover:text-blue-600">Liên hệ</a>
        </nav>

        <div class="flex items-center gap-2">
          <RouterLink
            to="/login"
            class="rounded-lg px-4 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
          >
            Đăng nhập
          </RouterLink>
          <RouterLink
            to="/signup"
            class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700"
          >
            Đăng ký
          </RouterLink>
        </div>
      </div>
    </header>

    <main>
      <section
        id="home"
        class="mx-auto grid max-w-7xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_1.05fr] lg:px-8 lg:py-24"
      >
        <div>
          <div
            class="inline-flex rounded-full bg-blue-50 px-4 py-2 text-sm font-bold text-blue-700"
          >
            IoT Device Management Platform
          </div>

          <h1
            class="mt-6 text-4xl font-black leading-tight tracking-tight text-slate-900 sm:text-5xl"
          >
            Hệ thống quản lý thiết bị IoT theo thời gian thực.
          </h1>

          <p class="mt-5 max-w-xl text-base leading-8 text-slate-600">
            Nền tảng hỗ trợ quản lý thiết bị, tiếp nhận telemetry, cập nhật
            trạng thái hoạt động và mô phỏng hướng kết nối LPWAN trong hệ thống
            IoT.
          </p>

          <div class="mt-8 flex flex-wrap gap-3">
            <RouterLink
              to="/login"
              class="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700"
            >
              Vào hệ thống
            </RouterLink>
            <a
              href="#features"
              class="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
            >
              Xem tính năng
            </a>
          </div>
        </div>

        <div
          class="rounded-[28px] border border-slate-200 bg-white p-4 shadow-xl shadow-slate-200/70"
        >
          <div class="rounded-2xl bg-[#f8fafc] p-4">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm font-bold text-slate-900">Tổng quan</p>
                <p class="text-xs text-slate-400">Realtime device monitoring</p>
              </div>
              <span
                class="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-600"
              >
                Online
              </span>
            </div>

            <div class="mt-5 grid grid-cols-3 gap-3">
              <div class="rounded-2xl bg-white p-4 shadow-sm">
                <p class="text-xs text-slate-400">Tổng thiết bị</p>
                <p class="mt-2 text-2xl font-black text-slate-900">120</p>
              </div>
              <div class="rounded-2xl bg-white p-4 shadow-sm">
                <p class="text-xs text-slate-400">Đang hoạt động</p>
                <p class="mt-2 text-2xl font-black text-emerald-600">98</p>
              </div>
              <div class="rounded-2xl bg-white p-4 shadow-sm">
                <p class="text-xs text-slate-400">Cảnh báo</p>
                <p class="mt-2 text-2xl font-black text-red-500">06</p>
              </div>
            </div>

            <div class="mt-4 rounded-2xl bg-white p-4 shadow-sm">
              <div class="mb-4 flex items-center justify-between">
                <p class="text-sm font-bold text-slate-800">
                  Biểu đồ telemetry
                </p>
                <p class="text-xs font-semibold text-slate-400">24 giờ</p>
              </div>

              <div class="flex h-48 items-end gap-2">
                <div
                  v-for="height in [
                    35, 52, 44, 70, 58, 76, 62, 86, 72, 94, 66, 78, 54, 88, 74,
                    82,
                  ]"
                  :key="height"
                  class="flex-1 rounded-t-lg bg-blue-500/80"
                  :style="{ height: `${height}%` }"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        id="features"
        class="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8"
      >
        <div class="mb-8">
          <p class="text-sm font-bold uppercase tracking-wider text-blue-600">
            Tính năng
          </p>
          <h2 class="mt-2 text-3xl font-black text-slate-900">
            Các chức năng chính
          </h2>
        </div>

        <div class="grid gap-5 md:grid-cols-3">
          <div
            v-for="feature in features"
            :key="feature.title"
            class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <div class="mb-5 h-12 w-12 rounded-2xl bg-blue-50" />
            <h3 class="text-lg font-bold text-slate-900">
              {{ feature.title }}
            </h3>
            <p class="mt-3 text-sm leading-7 text-slate-500">
              {{ feature.desc }}
            </p>
          </div>
        </div>
      </section>

      <section id="about" class="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div
          class="rounded-[28px] border border-slate-200 bg-white p-8 shadow-sm"
        >
          <p class="text-sm font-bold uppercase tracking-wider text-blue-600">
            Kiến trúc hệ thống
          </p>
          <h2 class="mt-2 text-3xl font-black text-slate-900">
            Thiết bị → MQTT → Backend → Database → Dashboard
          </h2>
          <p class="mt-4 max-w-4xl text-sm leading-7 text-slate-600">
            Backend giữ vai trò trung tâm tiếp nhận dữ liệu từ thiết bị, xử lý
            telemetry, cập nhật trạng thái, lưu vào cơ sở dữ liệu và phát sự
            kiện realtime cho frontend dashboard. Cách tổ chức này giúp hệ thống
            dễ mở rộng khi bổ sung nhiều loại thiết bị hoặc nhiều phương thức
            kết nối.
          </p>

          <div class="mt-8 grid gap-4 md:grid-cols-5">
            <div
              class="rounded-2xl bg-slate-50 p-4 text-center text-sm font-bold text-slate-700"
            >
              Device
            </div>
            <div
              class="rounded-2xl bg-slate-50 p-4 text-center text-sm font-bold text-slate-700"
            >
              MQTT
            </div>
            <div
              class="rounded-2xl bg-slate-50 p-4 text-center text-sm font-bold text-slate-700"
            >
              Backend API
            </div>
            <div
              class="rounded-2xl bg-slate-50 p-4 text-center text-sm font-bold text-slate-700"
            >
              Database
            </div>
            <div
              class="rounded-2xl bg-slate-50 p-4 text-center text-sm font-bold text-slate-700"
            >
              Dashboard
            </div>
          </div>
        </div>
      </section>

      <section
        id="contact"
        class="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8"
      >
        <div
          class="rounded-[28px] bg-blue-600 px-8 py-10 text-center text-white shadow-xl shadow-blue-200"
        >
          <h2 class="text-3xl font-black">Sẵn sàng quản lý hệ thống IoT?</h2>
          <p class="mx-auto mt-3 max-w-2xl text-sm leading-7 text-blue-50">
            Đăng nhập để truy cập dashboard quản trị thiết bị, theo dõi
            telemetry và kiểm tra cảnh báo realtime.
          </p>
          <RouterLink
            to="/login"
            class="mt-7 inline-flex rounded-xl bg-white px-5 py-3 text-sm font-bold text-blue-600 transition hover:bg-blue-50"
          >
            Đăng nhập hệ thống
          </RouterLink>
        </div>
      </section>
    </main>

    <footer class="border-t border-slate-200 bg-white py-6">
      <div
        class="mx-auto flex max-w-7xl flex-col gap-2 px-4 text-sm text-slate-500 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8"
      >
        <p>© 2026 IoT Admin. Device Management Platform.</p>
        <p>KLTN - IoT Backend & LPWAN-ready Dashboard</p>
      </div>
    </footer>
  </div>
</template>
