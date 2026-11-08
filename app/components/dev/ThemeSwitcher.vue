<script setup lang="ts">
const { theme, themes, setTheme } = useTheme()
</script>

<template>
  <div
    class="fixed right-3 bottom-3 z-50 flex gap-1 rounded-2xl border-2 border-line bg-surface p-1 shadow-raised-locked"
    role="group"
    aria-label="Theme (dev only)"
  >
    <button
      v-for="name in themes"
      :key="name"
      type="button"
      class="min-h-11 rounded-xl px-3 font-head text-sm font-semibold capitalize"
      :class="name === theme ? 'bg-primary text-primary-ink' : 'text-muted hover:bg-surface-2'"
      :aria-pressed="name === theme"
      @click="setTheme(name)"
    >
      {{ name }}
    </button>
  </div>
</template>
