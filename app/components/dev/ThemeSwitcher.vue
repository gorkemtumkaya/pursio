<script setup lang="ts">
const { theme, themes, setTheme } = useTheme()
const open = ref(false)
const panelId = 'dev-theme-switcher-panel'

function choose(name: (typeof themes)[number]) {
  setTheme(name)
  open.value = false
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') open.value = false
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>
<template>
  <div class="fixed right-3 bottom-24 z-35 flex flex-col-reverse items-end gap-2 lg:bottom-3 lg:flex-row">
    <button
      type="button"
      class="flex size-11 items-center justify-center rounded-full border-2 border-line bg-surface text-ink shadow-raised-locked outline-offset-2 focus-visible:outline-2 focus-visible:outline-ink hover:bg-surface-2 lg:hidden"
      aria-label="Theme (dev only)"
      :aria-expanded="open"
      :aria-controls="panelId"
      @click="open = !open"
    >
      <PathIcon name="palette" />
    </button>
    <div
      :id="panelId"
      class="max-w-[calc(100vw-1.5rem)] flex-col gap-1 rounded-2xl border-2 border-line bg-surface p-1 shadow-raised-locked lg:flex lg:flex-row"
      :class="open ? 'flex' : 'hidden'"
      role="group"
      aria-label="Theme (dev only)"
    >
      <button
        v-for="name in themes"
        :key="name"
        type="button"
        class="min-h-11 rounded-xl px-3 font-head text-sm font-semibold capitalize outline-offset-2 focus-visible:outline-2 focus-visible:outline-ink"
        :class="name === theme ? 'bg-primary text-primary-ink' : 'text-muted hover:bg-surface-2'"
        :aria-pressed="name === theme"
        @click="choose(name)"
      >
        {{ name }}
      </button>
    </div>
  </div>
</template>
