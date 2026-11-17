<script setup lang="ts">
/**
 * Round letter avatar of a hobby (spec: fresh-v2, Req 4.2, 3.3). Its colors come from the
 * nearest `data-hobby-slot` ancestor. Hidden from assistive technology, because the hobby
 * name always sits next to it.
 */
withDefaults(defineProps<{ letter: string; size?: 'small' | 'large' }>(), { size: 'large' })
</script>

<template>
  <span
    aria-hidden="true"
    class="flex shrink-0 items-center justify-center rounded-full bg-hobby-deep font-head leading-none font-extrabold text-hobby-ink"
    :class="size === 'small' ? 'size-6 text-xs' : 'size-11 text-lg'"
  >
    {{ letter }}
  </span>
</template>
