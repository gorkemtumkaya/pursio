<script setup lang="ts">
import { computed } from 'vue'
import { xpSummaryOf } from '#shared/utils/xp'
import { toWickOutfit, type WickOutfit } from '~/components/mascot/wick'
import { getActiveHobbyId } from '~/utils/active-hobby'
import { toHobbyLibrary } from '~/utils/cloud-library'
import { pickHobby } from '~/utils/hobby-store'
import { profileStats } from '~/utils/profile-stats'

/**
 * Profile_Page (spec: accounts-cloud-save; design `dev_docs/profile.html`):
 * Wick, the learner's name, level and totals over all paths, then the hobbies
 * and the milestones. Account, display name, theme, AI model and "Delete
 * account" live on the Settings_Page, opened from the gear button or the
 * sidebar.
 */
useHead({ title: 'Profile · Pursio' })

const auth = useAuth()
const cloud = useCloudStore()
const { theme } = useTheme()

const stats = computed(() => profileStats(cloud.paths.value, Date.now()))
const xp = computed(() => xpSummaryOf(stats.value.xp))

/** The path Wick dresses for and the hobby list marks: the Active_Hobby, else the last one added. */
const activeId = computed(() => pickHobby(toHobbyLibrary(cloud.paths.value, getActiveHobbyId()), null)?.id ?? null)
const outfit = computed<WickOutfit>(() => {
  const active = cloud.paths.value.find((path) => path.record.id === activeId.value)
  return active ? toWickOutfit(active.record.tree.mascot.set) : 'none'
})

/** The display name, else the start of the email for an Account_User, else "Guest". */
const heroName = computed(() => {
  const stored = cloud.profile.value?.displayName
  if (stored) return stored
  const local = auth.isAnonymous.value ? '' : (auth.email.value.split('@')[0] ?? '')
  return local === '' ? 'Guest' : local
})
const kicker = computed(() => {
  if (auth.isAnonymous.value) return 'Not signed in'
  const created = Date.parse(cloud.profile.value?.createdAt ?? '')
  if (Number.isNaN(created)) return 'Signed in'
  return `With Wick since ${new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(created)}`
})
</script>

<template>
  <AppShell>
    <main class="mx-auto flex w-full max-w-360 min-w-0 flex-col gap-3.5 px-4 pt-4 pb-26 lg:gap-5.5 lg:px-8 lg:pt-7 lg:pb-12">
      <AuthSessionGate>
        <template v-if="cloud.status.value === 'ready'">
          <ProfileHero
            :name="heroName"
            :kicker="kicker"
            :xp="xp"
            :streak="stats.streak"
            :skills-done="stats.skillsDone"
            :quests-done="stats.questsDone"
            :theme="theme"
            :outfit="outfit"
          />
          <div class="grid gap-3.5 lg:grid-cols-[repeat(auto-fit,minmax(340px,1fr))] lg:gap-5">
            <ProfileHobbies :hobbies="stats.hobbies" :active-id="activeId" />
            <ProfileMilestones :milestones="stats.milestones" />
          </div>
        </template>
        <AuthRetryNotice
          v-else-if="cloud.status.value === 'error'"
          :message="CLOUD_MESSAGES.loadFailed"
          @retry="cloud.reload"
        />
        <PathStatus v-else state="loading" message="Loading your profile…" />
      </AuthSessionGate>
    </main>
  </AppShell>
</template>
