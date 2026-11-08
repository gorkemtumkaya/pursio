<script setup lang="ts">
import { NEW_HOBBY_PATH } from '~/utils/hobby-store'

const isDev = import.meta.dev
const route = useRoute()
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
  <AppToast />
  <DevThemeSwitcher v-if="isDev && route.path !== '/' && route.path !== NEW_HOBBY_PATH" />
</template>
