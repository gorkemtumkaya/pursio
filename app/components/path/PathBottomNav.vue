<script setup lang="ts">
/** Mobile bottom navigation, fixed to the viewport bottom, 80 px tall (Req 12.1, 12.2). */
</script>

<template>
  <nav
    aria-label="Main"
    class="fixed inset-x-0 bottom-0 z-30 h-20 border-t-2 border-line bg-surface px-2 pt-2 pb-3.5"
  >
    <PathNavItems variant="bottom" />
  </nav>
</template>
