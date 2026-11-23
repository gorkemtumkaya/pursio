<script setup lang="ts">
/**
 * Tag above the Current_Node (Req 6.5). Decorative: the node's status line carries the state.
 * Preview_Mode (spec: sample-path, Req 5.3) passes its own `label`, such as "START HERE"; the tag
 * then fits its text instead of the fixed "NEXT UP" width.
 */
defineProps<{ label?: string }>()
</script>

<template>
  <span
    aria-hidden="true"
    class="flex h-7 items-center my-4 justify-center rounded-xl bg-ink text-[13px] font-extrabold tracking-[0.04em] text-bg lg:h-7.5"
    :class="label ? 'px-3 whitespace-nowrap' : 'w-22 lg:w-24'"
  >{{ label ?? 'NEXT UP' }}</span>
</template>
