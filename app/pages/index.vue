<script setup lang="ts">
import { onMounted } from 'vue'
import { lastActivePath, loadHobbyLibrary, NEW_HOBBY_PATH } from '~/utils/hobby-store'
import { browserStorage } from '~/utils/progress-store'

/**
 * App start. Opens the last active path, or the new hobby page when the
 * Hobby_Library is empty. The library lives in localStorage, so the choice is
 * made after mount; SSR and the first client render show the loading state, so
 * neither page flashes before the redirect.
 */
useHead({ title: 'Pursio' })

onMounted(async () => {
  const to = lastActivePath(loadHobbyLibrary(browserStorage)) ?? NEW_HOBBY_PATH
  await navigateTo(to, { replace: true })
})
</script>

<template>
  <main class="mx-auto w-full max-w-160">
    <PathStatus state="loading" />
  </main>
</template>
