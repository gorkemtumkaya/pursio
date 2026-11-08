<script setup lang="ts">
/** Desktop Side_Panel column: stays in view while the path scrolls (Req 12.4, 12.5). */
</script>

<template>
  <aside aria-label="Skill details" class="sticky top-0 flex h-dvh flex-col gap-5 overflow-y-auto py-7 pr-7 pb-12">
    <slot />
  </aside>
</template>
