<script setup lang="ts">
import type { Component } from "vue";

type CardTone = "blue" | "green" | "red" | "yellow" | "slate";

withDefaults(
  defineProps<{
    icon: Component;
    title: string;
    value: string | number;
    description: string;
    tone?: CardTone;
  }>(),
  {
    tone: "blue",
  },
);

function toneClasses(tone: CardTone) {
  switch (tone) {
    case "green":
      return {
        icon: "bg-emerald-50 text-emerald-600",
        dot: "bg-emerald-500",
      };
    case "red":
      return {
        icon: "bg-red-50 text-red-600",
        dot: "bg-red-500",
      };
    case "yellow":
      return {
        icon: "bg-amber-50 text-amber-600",
        dot: "bg-amber-500",
      };
    case "slate":
      return {
        icon: "bg-slate-100 text-slate-600",
        dot: "bg-slate-400",
      };
    default:
      return {
        icon: "bg-blue-50 text-blue-600",
        dot: "bg-blue-500",
      };
  }
}
</script>

<template>
  <div
    class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md"
  >
    <div class="flex items-start justify-between gap-4">
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <span class="h-2 w-2 rounded-full" :class="toneClasses(tone).dot" />
          <p class="truncate text-sm font-semibold text-slate-500">
            {{ title }}
          </p>
        </div>

        <p class="mt-3 text-3xl font-black tracking-tight text-slate-900">
          {{ value }}
        </p>

        <p class="mt-1 text-sm text-slate-500">
          {{ description }}
        </p>
      </div>

      <div class="rounded-2xl p-3" :class="toneClasses(tone).icon">
        <component :is="icon" class="h-6 w-6" aria-hidden="true" />
      </div>
    </div>
  </div>
</template>
