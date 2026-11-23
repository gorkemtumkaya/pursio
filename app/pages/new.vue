<script setup lang="ts">
import { computed, nextTick, ref, watch, watchEffect } from 'vue'
import { track } from '~/utils/analytics'
import { HOBBY_LIMIT_COPY, hobbyLimitHeading } from '~/utils/hobby-limit-copy'
import { INTAKE_COPY } from '~/utils/intake-copy'
import { detectedFields } from '~/utils/intake-panel'
import MascotWick from '~/components/mascot/wick.vue'
import { parseHobbyQuery, withoutHobbyQuery } from '~/utils/landing'
import type { WickMood } from '~/utils/wick'
import { getActiveHobbyId } from '~/utils/active-hobby'
import { cloudEntries, toHobbyLibrary } from '~/utils/cloud-library'
import { hobbyPath, lastActivePath } from '~/utils/hobby-store'

/**
 * New hobby page (spec: new-hobby-page). States: input, reading, panel,
 * generating, ready and error (spec: path-intake adds reading and panel: the
 * Note is read by intake and a short Panel opens under the inputs). Wick reacts
 * to the state. When the learner already has
 * paths, the top bar links back to the last active one and a "Continue a
 * hobby" row lists them under the card. The paths come from the account
 * (spec: accounts-cloud-save); an anonymous learner also gets a "Log in" link.
 */
useHead({ title: 'Pursio' })

const IDEAS = ['bouldering', 'film photography', 'guitar', 'sourdough baking', 'chess'] as const
const NOT_A_HOBBY_COPY =
  'Pursio builds paths for things you can practice and get better at. Try a hobby, a craft, a sport or a skill.'

const { theme } = useTheme()
const {
  hobby,
  note,
  state,
  panel,
  stepIndex,
  errorCode,
  errorMessage,
  summary,
  outfit,
  limitReached,
  activeHobbyCount,
  start,
  removeChip,
  toggleGoal,
  toggleKnown,
  toggleTaste,
  buildFromPanel,
  skip,
  retry,
  pickIdea,
  surprise,
  openPath,
} = useHobbyBuilder()

const retryInput = ref<HTMLInputElement | null>(null)
const panelRef = ref<{ focusStart: () => void } | null>(null)

/** The form with the hobby and the Note stays visible while intake reads and the Panel is open (AS13). */
const showForm = computed(() => state.value === 'input' || state.value === 'reading' || state.value === 'panel')
const reading = computed(() => state.value === 'reading')

const auth = useAuth()
const cloud = useCloudStore()
const authDialog = useAuthDialog()
const route = useRoute()
const router = useRouter()

/** Saved hobbies from the account; empty until its rows are loaded. */
const savedHobbies = computed(() => (cloud.status.value === 'ready' ? cloudEntries(cloud.paths.value) : []))
const backTo = computed(() =>
  cloud.status.value === 'ready' ? lastActivePath(toHobbyLibrary(cloud.paths.value, getActiveHobbyId())) : null,
)
const showContinue = computed(
  () => savedHobbies.value.length > 0 && (state.value === 'input' || state.value === 'error'),
)

const labelClass = 'text-[13px] font-extrabold uppercase tracking-[0.06em] text-muted'
const inputClass = computed(() => [
  'h-[58px] w-full rounded-[18px] border-2 bg-bg px-[18px] text-lg font-bold text-ink outline-none',
  'placeholder:text-muted focus:border-primary',
  hobby.value.trim() ? 'border-primary' : 'border-line',
])
const primaryButtonClass =
  'h-[58px] w-full rounded-[18px] bg-primary font-head text-[19px] font-semibold text-primary-ink '
  + 'shadow-[0_5px_0_var(--color-primary-deep)] bouncy [--bouncy-depth:5px] '
  + 'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary'

/**
 * The free plan's hobby limit (3 active hobbies). The limit card takes the place of the form
 * when the account cannot add a hobby, or when a build was stopped by the limit. A hobby handed
 * over in `?hobby=` is tried first: rebuilding a hobby the learner already has is always allowed.
 */
const showLimit = computed(
  () => state.value === 'limit' || (state.value === 'input' && limitReached.value && parseHobbyQuery(route.query.hobby) === null),
)
watch(showLimit, (shown) => {
  if (shown && import.meta.client) track('hobby_limit_shown')
}, { immediate: true })

const mood = computed<WickMood>(() => {
  if (state.value === 'generating' || state.value === 'reading') return 'think'
  if (state.value === 'panel') return 'happy'
  if (state.value === 'ready') return 'cheer'
  return 'idle'
})

const shownHobby = computed(() => hobby.value.trim())

const bubble = computed(() => {
  switch (state.value) {
    case 'reading':
      return INTAKE_COPY.wickReading
    case 'panel':
      return panel.value !== null && detectedFields(panel.value.profile).length > 0
        ? INTAKE_COPY.wickPanel
        : INTAKE_COPY.wickPanelNoChips
    case 'generating':
      return `Building your ${shownHobby.value} path…`
    case 'ready':
      return `Your ${shownHobby.value} path is ready!`
    case 'error':
      return errorCode.value === 'not_a_hobby'
        ? `Hmm, I don't know “${shownHobby.value}” as a hobby.`
        : 'Something went wrong.'
    default:
      return showLimit.value ? HOBBY_LIMIT_COPY.wick : 'What do you want to get better at?'
  }
})

const errorCopy = computed(() =>
  errorCode.value === 'not_a_hobby' ? NOT_A_HOBBY_COPY : (errorMessage.value ?? 'Something went wrong.'),
)

const status = computed(() => {
  switch (state.value) {
    case 'reading':
      return INTAKE_COPY.statusReading
    case 'panel':
      return INTAKE_COPY.statusPanel
    case 'generating':
      return 'Building your skill tree…'
    case 'ready':
      return 'Your path is ready.'
    case 'error':
      return errorCopy.value
    default:
      return showLimit.value ? hobbyLimitHeading(activeHobbyCount.value) : ''
  }
})

/**
 * Hobby handoff from the landing page (spec: landing-page, Req 11; path-intake, Req 1.6, 1.7).
 * Runs once: `?hobby=` fills the hobby and runs intake as soon as a session is ready, which
 * opens the Panel like a normal build (focus on the first question, since there is no Note), or
 * builds at once when intake fails. The URL then loses `hobby`, so refresh and back start nothing.
 * `start()` reads the hobby before its first await, so the replace right after it does not change
 * the request. A failed build is not retried.
 */
let handoffDone = false
watchEffect(() => {
  if (handoffDone || !import.meta.client) return
  const value = parseHobbyQuery(route.query.hobby)
  if (value === null) {
    handoffDone = true
    return
  }
  if (auth.status.value !== 'anonymous' && auth.status.value !== 'signed_in') return
  handoffDone = true
  hobby.value = value
  void start()
  void router.replace({ query: withoutHobbyQuery(route.query) })
})

watch(state, async (next) => {
  if (next !== 'error' && next !== 'panel') return
  await nextTick()
  if (next === 'error') retryInput.value?.focus()
  else panelRef.value?.focusStart()
})
</script>

<template>
  <div class="flex min-h-dvh flex-col">
    <!-- Same width and side padding as <main>, so the logo and the actions line up with the content. -->
    <header class="mx-auto flex w-full max-w-[1048px] items-center justify-between px-4 py-5 max-[700px]:py-3">
      <NuxtLink
        :to="backTo ?? '/'"
        class="flex items-center gap-2.5 rounded-[14px] font-head text-[26px] font-bold text-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary max-[700px]:text-[21px]"
      >
        <span aria-hidden="true" class="size-9 shrink-0 bg-(image:--pursio-logo) bg-contain bg-center bg-no-repeat" />
        <span>Pursio</span>
      </NuxtLink>
      <div class="flex items-center gap-2">
        <NuxtLink
          v-if="backTo"
          :to="backTo"
          class="flex h-11 items-center rounded-[14px] px-3 text-[15px] font-extrabold text-ink hover:bg-surface-2 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <span aria-hidden="true">←&nbsp;</span>
          <span class="max-[700px]:hidden">Back to my path</span>
          <span class="min-[701px]:hidden">My path</span>
        </NuxtLink>
        <button
          v-if="auth.isAnonymous.value"
          type="button"
          class="flex h-11 items-center rounded-[14px] border-2 border-line bg-surface px-4 text-[15px] font-extrabold text-accent-text hover:bg-surface-2 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary"
          @click="authDialog.show('login')"
        >
          Log in
        </button>
        <NuxtLink
          to="/settings"
          aria-label="Settings"
          class="flex size-11 items-center justify-center rounded-[14px] text-ink hover:bg-surface-2 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <PathIcon name="settings" class="size-[22px]" />
        </NuxtLink>
      </div>
    </header>

    <AuthSessionGate>
    <main class="mx-auto flex w-full max-w-[1048px] flex-col gap-8 px-4 pt-10 pb-12 max-[700px]:pt-3">
      <!-- The form column takes most of the width (about 640 of 1016 px), so the intake
           options fit several to a row; Wick's column keeps about a third. -->
      <div class="flex flex-wrap items-center gap-12 max-[700px]:gap-2">
        <div class="flex flex-[1_1_280px] flex-col items-center gap-1.5">
          <p
            class="max-w-[436px] rounded-[18px] bg-ink px-[18px] py-3 text-center font-display text-[clamp(17px,2.4vw,26px)] leading-tight font-semibold text-bg"
          >
            {{ bubble }}
          </p>
          <MascotWick :theme="theme" :mood="mood" :outfit="outfit" :size="240" />
        </div>

        <div class="flex min-w-0 flex-[5_1_400px] flex-col gap-6">
          <div
            class="flex flex-col rounded-[26px] border-2 border-line bg-surface p-5 shadow-raised-line max-[700px]:rounded-[22px] max-[700px]:p-4"
          >
            <!-- free plan hobby limit: a card in place of the form -->
            <HobbyLimitCard v-if="showLimit" :count="activeHobbyCount" :manage-to="backTo ?? '/path'" />

            <!-- input -->
            <div v-else-if="showForm" class="flex flex-col gap-5">
              <form class="flex flex-col gap-3.5" :aria-busy="reading" @submit.prevent="start">
                <label for="hobby" :class="labelClass">Your hobby</label>
                <input
                  id="hobby"
                  v-model="hobby"
                  type="text"
                  name="hobby"
                  maxlength="60"
                  autocomplete="off"
                  placeholder="Type any hobby…"
                  :readonly="reading"
                  :class="inputClass"
                >
                <HobbyNoteField v-model="note" :readonly="reading" />
                <template v-if="state !== 'panel'">
                  <button type="submit" :class="[primaryButtonClass, reading ? 'cursor-wait opacity-70' : '']" :aria-disabled="reading">
                    {{ INTAKE_COPY.build }}
                  </button>
                  <HobbyIdeaChips :ideas="IDEAS" surprise :disabled="reading" @pick="pickIdea" @surprise="surprise" />
                </template>
              </form>

              <Transition
                enter-active-class="motion-safe:transition-[opacity,translate] motion-safe:duration-200"
                enter-from-class="opacity-0 translate-y-1"
                leave-active-class="motion-safe:transition-opacity motion-safe:duration-150"
                leave-to-class="opacity-0"
              >
                <HobbyIntakePanel
                  v-if="state === 'panel' && panel"
                  ref="panelRef"
                  :state="panel"
                  @remove="removeChip"
                  @toggle-goal="toggleGoal"
                  @toggle-known="toggleKnown"
                  @toggle-taste="toggleTaste"
                  @build="buildFromPanel"
                  @skip="skip"
                />
              </Transition>
            </div>

            <!-- generating -->
            <HobbyBuildSteps v-else-if="state === 'generating'" :steps="BUILD_STEPS" :active="stepIndex" />

            <!-- ready -->
            <HobbyReadyCard v-else-if="state === 'ready' && summary" :summary="summary" @open="openPath" />

            <!-- error -->
            <form v-else-if="state === 'error'" class="flex flex-col gap-3.5" @submit.prevent="retry">
              <p class="text-base leading-normal font-bold text-muted">{{ errorCopy }}</p>
              <input
                id="hobby-retry"
                ref="retryInput"
                v-model="hobby"
                type="text"
                name="hobby"
                maxlength="60"
                autocomplete="off"
                aria-label="Your hobby"
                :class="inputClass"
              >
              <HobbyIdeaChips :ideas="IDEAS.slice(0, 4)" :show-label="false" @pick="pickIdea" />
              <button type="submit" :class="primaryButtonClass">
                Try again
              </button>
            </form>

            <p role="status" aria-live="polite" class="sr-only">{{ status }}</p>
          </div>

          <section v-if="showContinue" aria-labelledby="continue-title" class="flex flex-col gap-2.5">
            <h2 id="continue-title" :class="labelClass">Continue a hobby</h2>
            <ul class="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-2.5">
              <li v-for="entry in savedHobbies" :key="entry.id">
                <NuxtLink
                  :to="hobbyPath(entry.id)"
                  class="flex h-full flex-col gap-2 rounded-2xl border-2 border-line bg-surface px-3.5 py-3 text-ink hover:bg-surface-2 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <span class="flex items-baseline justify-between gap-2">
                    <span class="truncate text-[15px] font-extrabold">{{ entry.hobby }}</span>
                    <span class="shrink-0 text-sm font-extrabold text-muted">
                      {{ entry.percent }}%<span class="sr-only"> complete</span>
                    </span>
                  </span>
                  <span aria-hidden="true" class="block h-2 w-full overflow-hidden rounded-full bg-locked">
                    <span class="block h-full bg-done" :style="{ width: `${entry.percent}%` }" />
                  </span>
                </NuxtLink>
              </li>
            </ul>
          </section>
        </div>
      </div>

      <HobbyBenefits />
    </main>
    </AuthSessionGate>
  </div>
</template>
