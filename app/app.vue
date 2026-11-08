<script setup lang="ts">
const isDev = import.meta.dev
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
  <DevThemeSwitcher v-if="isDev" />
</template>
