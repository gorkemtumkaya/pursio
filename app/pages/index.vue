<script setup lang="ts">
import { watch } from 'vue'
import { getActiveHobbyId } from '~/utils/active-hobby'
import { toHobbyLibrary } from '~/utils/cloud-library'
import { lastActivePath, NEW_HOBBY_PATH } from '~/utils/hobby-store'

/**
 * App start. Once the account's paths are loaded it opens the Active_Hobby's
 * path, or the new hobby page when the account has none (spec:
 * accounts-cloud-save, Req 4.7). Until then it shows the loading state, so
 * neither page flashes before the redirect.
 */
useHead({ title: 'Pursio' })

const cloud = useCloudStore()

watch(
  cloud.status,
  async (status) => {
    if (status !== 'ready' || !import.meta.client) return
    const to = lastActivePath(toHobbyLibrary(cloud.paths.value, getActiveHobbyId())) ?? NEW_HOBBY_PATH
    await navigateTo(to, { replace: true })
  },
  { immediate: true },
)
</script>

<template>
  <AuthSessionGate>
    <main class="mx-auto w-full max-w-160">
      <AuthRetryNotice v-if="cloud.status.value === 'error'" :message="CLOUD_MESSAGES.loadFailed" @retry="cloud.reload" />
      <PathStatus v-else state="loading" />
    </main>
  </AuthSessionGate>
</template>
