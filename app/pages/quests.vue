<script setup lang="ts">
import { computed } from 'vue'
import { getActiveHobbyId } from '~/utils/active-hobby'
import { toHobbyLibrary } from '~/utils/cloud-library'
import { pickHobby } from '~/utils/hobby-store'

/**
 * Quests_Page (spec: quests-page): today's pick, the weekly reward and the
 * quests of the Active_Hobby. Same frame as the Profile page.
 */
useHead({ title: 'Quests · Pursio' })

const cloud = useCloudStore()

/** The Active_Hobby, else the last one added. Archived hobbies are never picked. */
const picked = computed(() => pickHobby(toHobbyLibrary(cloud.paths.value, getActiveHobbyId()), null))
const path = computed(() => cloud.paths.value.find((p) => p.record.id === picked.value?.id) ?? null)
</script>

<template>
  <AppShell>
    <main class="mx-auto flex w-full max-w-360 min-w-0 flex-col gap-3.5 px-4 pt-4 pb-26 lg:gap-5.5 lg:px-8 lg:pt-7 lg:pb-12">
      <AuthSessionGate>
        <template v-if="cloud.status.value === 'ready'">
          <QuestsView v-if="path" :key="path.pathId" :path="path" />
          <QuestsEmpty v-else />
        </template>
        <AuthRetryNotice
          v-else-if="cloud.status.value === 'error'"
          :message="CLOUD_MESSAGES.loadFailed"
          @retry="cloud.reload"
        />
        <PathStatus v-else state="loading" message="Loading your quests…" />
      </AuthSessionGate>
    </main>
  </AppShell>
</template>
