<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";

import Sidebar from "../components/dashboard/Sidebar.vue";
import HeaderBar from "../components/dashboard/HeaderBar.vue";

import { useDeviceStore } from "../store/deviceStore";

const deviceStore = useDeviceStore();

const sidebarOpen = ref(false);

function toggleSidebar() {
  sidebarOpen.value = !sidebarOpen.value;
}

function closeSidebar() {
  sidebarOpen.value = false;
}

onMounted(() => {
  void deviceStore.bootstrap();
});

onBeforeUnmount(() => {
  deviceStore.disconnectSocket();
  deviceStore.stopRelativeTimeClock();
});
</script>

<template>
  <div class="min-h-screen bg-[#f4f6fb] text-slate-900">
    <Sidebar :open="sidebarOpen" @close="closeSidebar" />

    <div class="min-h-screen lg:pl-[260px]">
      <HeaderBar @toggleSidebar="toggleSidebar" />

      <main class="px-4 py-5 sm:px-6 lg:px-8">
        <div class="mx-auto max-w-[1440px]">
          <RouterView />
        </div>
      </main>
    </div>
  </div>
</template>
