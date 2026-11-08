<script setup lang="ts">
import { computed } from 'vue'

/**
 * Desktop left sidebar: logo, main navigation, "Your hobbies" and
 * "+ Add a hobby" (Req 12.3). Hobby entries and the add button are static
 * placeholders that do nothing when activated (Req 12.8).
 */
const props = defineProps<{ hobby: string; percent: number }>()

/** Fixed progress for the static second hobby. */
const FILM_PHOTOGRAPHY_PERCENT = 12

const activePercent = computed(() => {
  const n = Number.isFinite(props.percent) ? Math.round(props.percent) : 0
  return Math.min(100, Math.max(0, n))
})
</script>

<template>
  <nav
    aria-label="Main"
    class="sticky top-0 flex h-dvh flex-col gap-7 overflow-y-auto border-r-2 border-line px-5 py-7"
  >
    <div class="flex items-center gap-2.5">
      <span
        class="flex size-9.5 shrink-0 items-center justify-center rounded-node bg-primary text-primary-ink shadow-raised-primary"
      >
        <PathIcon name="star" class="size-5.5" />
      </span>
      <span class="font-head text-[26px] font-bold text-ink">Pursio</span>
    </div>

    <PathNavItems variant="side" />

    <section aria-labelledby="sidebar-hobbies" class="flex flex-col gap-2.5">
      <h2 id="sidebar-hobbies" class="text-xs font-extrabold tracking-widest text-muted">
        YOUR HOBBIES
      </h2>
      <ul class="flex flex-col gap-2.5">
        <li>
          <button
            type="button"
            aria-current="true"
            class="flex min-h-11 w-full flex-col gap-2 rounded-2xl border-2 border-ink bg-surface px-3.5 py-3 text-left text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            <span class="text-[15px] font-extrabold">
              {{ hobby }}<span class="sr-only">, {{ activePercent }}% complete</span>
            </span>
            <span aria-hidden="true" class="block h-2 w-full overflow-hidden rounded-full bg-locked">
              <span class="block h-full bg-done" :style="{ width: `${activePercent}%` }" />
            </span>
          </button>
        </li>
        <li>
          <button
            type="button"
            class="flex min-h-11 w-full flex-col gap-2 rounded-2xl border-2 border-line bg-surface px-3.5 py-3 text-left text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            <span class="text-[15px] font-extrabold">
              Film photography<span class="sr-only">, {{ FILM_PHOTOGRAPHY_PERCENT }}% complete</span>
            </span>
            <span aria-hidden="true" class="block h-2 w-full overflow-hidden rounded-full bg-locked">
              <span class="block h-full bg-done" :style="{ width: `${FILM_PHOTOGRAPHY_PERCENT}%` }" />
            </span>
          </button>
        </li>
      </ul>
      <button
        type="button"
        class="h-12 rounded-2xl border-2 border-dashed border-locked-deep text-[15px] font-extrabold text-muted hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        + Add a hobby
      </button>
    </section>
  </nav>
</template>
