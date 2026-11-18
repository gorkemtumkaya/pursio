<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue'
import { hasPathHint, PATH_HINT_ATTR } from '#shared/utils/path-hint'
import { getActiveHobbyId } from '~/utils/active-hobby'
import { track } from '~/utils/analytics'
import { toHobbyLibrary } from '~/utils/cloud-library'
import { lastActivePath, NEW_HOBBY_PATH } from '~/utils/hobby-store'
import { decideLanding, pathCheckOf, SITE_URL } from '~/utils/landing'
import { LANDING_DESCRIPTION, LANDING_TITLE } from '~/utils/landing-copy'

/**
 * `/` (spec: landing-page, Req 1, 12, 15.3, 15.4). The server always renders
 * the landing. In the browser the Path_Check decides: a Visitor with a saved
 * path is sent to it (the redirect of accounts-cloud-save, Req 4.7), a Visitor
 * with none stays on the landing, and `/?landing=1` always shows the landing.
 * While the check runs, a device with a Path_Hint shows the loader instead of
 * the landing, so the landing does not flash before the redirect.
 */
const route = useRoute()
const auth = useAuth()
const cloud = useCloudStore()

// Client only: same rule as the head script, so hydration sees no change. An
// in-app navigation to `/` does not run the head script again; this does.
const hint = import.meta.client && hasPathHint((key) => localStorage.getItem(key), location.pathname, location.search)
if (import.meta.client) document.documentElement.toggleAttribute(PATH_HINT_ATTR, hint)
onBeforeUnmount(() => document.documentElement.removeAttribute(PATH_HINT_ATTR))

const check = computed(() => pathCheckOf(auth.status.value, cloud.status.value, cloud.paths.value.length))
const view = computed(() => decideLanding({ landing: route.query.landing, hint, check: check.value }))

// Literal values, no runtime config (Req 14.7). og.png is supplied by the owner.
useHead({ title: LANDING_TITLE, link: [{ rel: 'canonical', href: `${SITE_URL}/` }] })
useSeoMeta({
  description: LANDING_DESCRIPTION,
  ogTitle: LANDING_TITLE,
  ogDescription: LANDING_DESCRIPTION,
  ogType: 'website',
  ogUrl: `${SITE_URL}/`,
  ogImage: `${SITE_URL}/og.png`,
  ogImageWidth: 1200,
  ogImageHeight: 630,
})

// Existing redirect: same target as before, now triggered by the decision.
watch(
  view,
  async (next) => {
    if (next !== 'redirect' || !import.meta.client) return
    const to = lastActivePath(toHobbyLibrary(cloud.paths.value, getActiveHobbyId())) ?? NEW_HOBBY_PATH
    await navigateTo(to, { replace: true })
  },
  { immediate: true },
)

// Once per visit, and only for the landing itself: the `pending` shell also
// renders LandingView, so the event cannot live in that component.
let viewedSent = false
watch(
  view,
  (next) => {
    if (next !== 'landing' || viewedSent || !import.meta.client) return
    viewedSent = true
    track('landing_viewed')
  },
  { immediate: true },
)
</script>

<template>
  <template v-if="view === 'pending'">
    <main class="mx-auto hidden w-full max-w-160 path-hint:block">
      <PathStatus state="loading" />
    </main>
    <LandingView class="path-hint:hidden" />
  </template>
  <LandingView v-else-if="view === 'landing'" />
  <main v-else class="mx-auto w-full max-w-160">
    <template v-if="view === 'retry'">
      <AuthRetryNotice
        v-if="auth.status.value === 'unavailable'"
        :message="AUTH_MESSAGES.unavailable"
        @retry="auth.retry"
      />
      <AuthRetryNotice v-else :message="CLOUD_MESSAGES.loadFailed" @retry="cloud.reload" />
    </template>
    <PathStatus v-else state="loading" />
  </main>
</template>
