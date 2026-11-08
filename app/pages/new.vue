<script setup lang="ts">
import { computed, nextTick, onMounted, ref, shallowRef, watch } from 'vue'
import MascotWick from '~/components/mascot/wick.vue'
import type { WickMood } from '~/components/mascot/wick'
import { hobbyEntries, hobbyPath, lastActivePath, loadHobbyLibrary, type HobbyEntry } from '~/utils/hobby-store'
import { browserStorage } from '~/utils/progress-store'

/**
 * New hobby page (spec: new-hobby-page). Four states: input, generating,
 * ready and error. Wick reacts to the state. When the learner already has
 * paths, the top bar links back to the last active one and a "Continue a
 * hobby" row lists them under the card.
 */
useHead({ title: 'Pursio' })

const IDEAS = ['bouldering', 'film photography', 'guitar', 'sourdough baking', 'chess'] as const
const NOT_A_HOBBY_COPY =
  'Pursio builds paths for things you can practice and get better at. Try a hobby, a craft, a sport or a skill.'

const { theme } = useTheme()
const {
  hobby,
  level,
  state,
  stepIndex,
  errorCode,
  errorMessage,
  summary,
  outfit,
  build,
  pickIdea,
  surprise,
  openPath,
} = useHobbyBuilder()

const retryInput = ref<HTMLInputElement | null>(null)

/** Saved hobbies, read after mount (localStorage) so SSR and hydration agree. */
const savedHobbies = shallowRef<HobbyEntry[]>([])
const backTo = shallowRef<string | null>(null)
const showContinue = computed(
  () => savedHobbies.value.length > 0 && (state.value === 'input' || state.value === 'error'),
)

function loadSaved(): void {
  const library = loadHobbyLibrary(browserStorage)
  savedHobbies.value = hobbyEntries(browserStorage, library)
  backTo.value = lastActivePath(library)
}

onMounted(loadSaved)
// An Undo from the toast can bring a hobby back while this page is open.
watch(useLibraryRevision().revision, loadSaved)

const labelClass = 'text-[13px] font-extrabold uppercase tracking-[0.06em] text-muted'
const inputClass = computed(() => [
  'h-[58px] w-full rounded-[18px] border-2 bg-bg px-[18px] text-lg font-bold text-ink outline-none',
  'placeholder:text-muted focus:border-primary',
  hobby.value.trim() ? 'border-primary' : 'border-line',
])
const primaryButtonClass =
  'h-[58px] w-full rounded-[18px] bg-primary font-head text-[19px] font-semibold text-primary-ink '
  + 'shadow-[0_5px_0_var(--color-primary-deep)] transition-[translate,box-shadow] duration-75 '
  + 'active:translate-y-1 active:shadow-[0_1px_0_var(--color-primary-deep)] '
  + 'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary'

const mood = computed<WickMood>(() => {
  if (state.value === 'generating') return 'think'
  if (state.value === 'ready') return 'cheer'
  return 'idle'
})

const shownHobby = computed(() => hobby.value.trim())

const bubble = computed(() => {
  switch (state.value) {
    case 'generating':
      return `Building your ${shownHobby.value} path…`
    case 'ready':
      return `Your ${shownHobby.value} path is ready!`
    case 'error':
      return errorCode.value === 'not_a_hobby'
        ? `Hmm, I don't know “${shownHobby.value}” as a hobby.`
        : 'Something went wrong.'
    default:
      return 'What do you want to get better at?'
  }
})

const errorCopy = computed(() =>
  errorCode.value === 'not_a_hobby' ? NOT_A_HOBBY_COPY : (errorMessage.value ?? 'Something went wrong.'),
)

const status = computed(() => {
  switch (state.value) {
    case 'generating':
      return 'Building your skill tree…'
    case 'ready':
      return 'Your path is ready.'
    case 'error':
      return errorCopy.value
    default:
      return ''
  }
})

watch(state, async (next) => {
  if (next !== 'error') return
  await nextTick()
  retryInput.value?.focus()
})
</script>

<template>
  <div class="flex min-h-dvh flex-col">
    <header class="flex items-center justify-between px-7 py-5 max-[700px]:px-4 max-[700px]:py-3">
      <div class="flex items-center gap-2.5 font-head text-[26px] font-bold text-ink max-[700px]:text-[21px]">
        <span
          class="grid size-9 place-items-center rounded-full bg-primary text-primary-ink shadow-[0_4px_0_var(--color-primary-deep)]"
          aria-hidden="true"
        >
          <PathIcon name="star" class="size-5" />
        </span>
        <span>Pursio</span>
      </div>
      <div class="flex items-center gap-2">
        <NuxtLink
          v-if="backTo"
          :to="backTo"
          class="flex h-11 items-center rounded-[14px] px-3 text-[15px] font-extrabold text-accent-text hover:bg-surface-2 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <span aria-hidden="true">←&nbsp;</span>
          <span class="max-[700px]:hidden">Back to my path</span>
          <span class="min-[701px]:hidden">My path</span>
        </NuxtLink>
        <NuxtLink
          to="/settings"
          aria-label="Settings"
          class="flex h-11 items-center gap-2 rounded-[14px] border-2 border-line bg-surface px-3.5 text-[15px] font-extrabold text-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <PathIcon name="settings" class="size-[18px]" />
          <span class="max-[700px]:hidden">Settings</span>
        </NuxtLink>
      </div>
    </header>

    <main class="mx-auto flex w-full max-w-[1048px] flex-col gap-8 px-4 pb-12">
      <div class="flex flex-wrap items-center gap-6 max-[700px]:gap-2">
        <div class="flex flex-[1_1_340px] flex-col items-center gap-1.5">
          <p
            class="max-w-[436px] rounded-[18px] bg-ink px-[18px] py-3 text-center font-display text-[clamp(17px,2.4vw,26px)] leading-tight font-semibold text-bg"
          >
            {{ bubble }}
          </p>
          <MascotWick :theme="theme" :mood="mood" :outfit="outfit" :size="240" />
        </div>

        <div class="flex min-w-0 flex-[1_1_400px] flex-col gap-6">
          <div
            class="flex flex-col rounded-[26px] border-2 border-line bg-surface p-5 shadow-raised-line max-[700px]:rounded-[22px] max-[700px]:p-4"
          >
            <!-- input -->
            <form v-if="state === 'input'" class="flex flex-col gap-3.5" @submit.prevent="build">
              <label for="hobby" :class="labelClass">Your hobby</label>
              <input
                id="hobby"
                v-model="hobby"
                type="text"
                name="hobby"
                maxlength="60"
                autocomplete="off"
                placeholder="Type any hobby…"
                :class="inputClass"
              >
              <HobbyLevelPicker v-model="level" />
              <button type="submit" :class="primaryButtonClass">
                Build my path
              </button>
              <HobbyIdeaChips :ideas="IDEAS" surprise @pick="pickIdea" @surprise="surprise" />
            </form>

            <!-- generating -->
            <HobbyBuildSteps v-else-if="state === 'generating'" :steps="BUILD_STEPS" :active="stepIndex" />

            <!-- ready -->
            <HobbyReadyCard v-else-if="state === 'ready' && summary" :summary="summary" @open="openPath" />

            <!-- error -->
            <form v-else-if="state === 'error'" class="flex flex-col gap-3.5" @submit.prevent="build">
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
  </div>
</template>
