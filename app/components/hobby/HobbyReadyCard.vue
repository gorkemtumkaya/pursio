<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { TreeSummary } from '~/utils/tree-summary'

defineProps<{ summary: TreeSummary }>()
defineEmits<{ open: [] }>()

const openButton = ref<HTMLButtonElement | null>(null)

onMounted(() => {
  openButton.value?.focus()
})
</script>

<template>
  <div class="flex flex-col gap-5">
    <dl class="grid grid-cols-3 gap-3 text-center">
      <div class="flex flex-col gap-1 rounded-2xl bg-surface-2 px-2 py-3">
        <dd class="font-head text-2xl font-bold text-ink">{{ summary.skills }}</dd>
        <dt class="text-sm font-bold text-muted">skills</dt>
      </div>
      <div class="flex flex-col gap-1 rounded-2xl bg-surface-2 px-2 py-3">
        <dd class="font-head text-2xl font-bold text-ink">{{ summary.sections }}</dd>
        <dt class="text-sm font-bold text-muted">sections</dt>
      </div>
      <div class="flex flex-col gap-1 rounded-2xl bg-surface-2 px-2 py-3">
        <dd class="font-head text-2xl font-bold text-ink">{{ summary.quests }}</dd>
        <dt class="text-sm font-bold text-muted">quests</dt>
      </div>
    </dl>

    <p class="text-sm font-bold text-muted">
      First up: <strong class="text-ink">{{ summary.firstSkill }}</strong>
    </p>

    <button
      ref="openButton"
      type="button"
      class="h-14 w-full rounded-2xl bg-primary font-head text-lg font-semibold text-primary-ink shadow-raised-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      @click="$emit('open')"
    >
      Open my path
    </button>
  </div>
</template>
