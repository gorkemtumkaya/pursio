<script setup lang="ts">
// Dev-only token reference. Returns 404 in production builds.
definePageMeta({
  middleware: () => {
    if (!import.meta.dev) {
      return abortNavigation(createError({ statusCode: 404, statusMessage: 'Page not found' }))
    }
  },
})

useHead({ title: 'Theme tokens · Pursio' })

// Static class strings so Tailwind's scanner generates every utility.
const colorTokens = [
  { name: 'bg', swatchClass: 'bg-bg' },
  { name: 'surface', swatchClass: 'bg-surface' },
  { name: 'surface-2', swatchClass: 'bg-surface-2' },
  { name: 'ink', swatchClass: 'bg-ink' },
  { name: 'muted', swatchClass: 'bg-muted' },
  { name: 'line', swatchClass: 'bg-line' },
  { name: 'primary', swatchClass: 'bg-primary' },
  { name: 'primary-deep', swatchClass: 'bg-primary-deep' },
  { name: 'primary-ink', swatchClass: 'bg-primary-ink' },
  { name: 'primary-soft', swatchClass: 'bg-primary-soft' },
  { name: 'accent-text', swatchClass: 'bg-accent-text' },
  { name: 'done', swatchClass: 'bg-done' },
  { name: 'done-deep', swatchClass: 'bg-done-deep' },
  { name: 'done-ink', swatchClass: 'bg-done-ink' },
  { name: 'locked', swatchClass: 'bg-locked' },
  { name: 'locked-deep', swatchClass: 'bg-locked-deep' },
  { name: 'locked-ink', swatchClass: 'bg-locked-ink' },
  { name: 'gold', swatchClass: 'bg-gold' },
  { name: 'gold-deep', swatchClass: 'bg-gold-deep' },
  { name: 'trail', swatchClass: 'bg-trail' },
  { name: 'banner', swatchClass: 'bg-banner' },
  { name: 'banner-deep', swatchClass: 'bg-banner-deep' },
  { name: 'banner-ink', swatchClass: 'bg-banner-ink' },
  { name: 'banner-muted', swatchClass: 'bg-banner-muted' },
  { name: 'overlay', swatchClass: 'bg-overlay' },
] as const

const fontTokens = [
  { name: 'font-head', fontClass: 'font-head', use: 'Titles, labels, buttons' },
  { name: 'font-display', fontClass: 'font-display', use: 'Big moments only' },
  { name: 'font-body', fontClass: 'font-body', use: 'Everything else' },
] as const

const { theme } = useTheme()
const values = ref<Record<string, string>>({})

function readValues(): void {
  const styles = getComputedStyle(document.documentElement)
  const names = [...colorTokens.map((t) => t.name), 'radius-node', 'font-head', 'font-display', 'font-body']
  values.value = Object.fromEntries(
    names.map((name) => [name, styles.getPropertyValue(`--pursio-${name}`).trim()]),
  )
}

onMounted(readValues)
watch(theme, () => nextTick(readValues))
</script>

<template>
  <main class="mx-auto flex max-w-5xl flex-col gap-10 px-4 py-8 pb-28">
    <header class="flex flex-col gap-1">
      <p class="font-head text-sm font-semibold text-muted uppercase">Dev</p>
      <h1 class="font-display text-4xl text-ink">Theme tokens</h1>
      <p class="text-muted">
        Active theme: <span class="font-head font-semibold text-accent-text">{{ theme }}</span>.
        Switch with the control in the bottom-right corner.
      </p>
    </header>

    <section class="flex flex-col gap-3">
      <h2 class="font-head text-xl font-semibold">Colors</h2>
      <div class="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <DevSwatch
          v-for="token in colorTokens"
          :key="token.name"
          :name="token.name"
          :swatch-class="token.swatchClass"
          :value="values[token.name] ?? ''"
        />
      </div>
    </section>

    <section class="flex flex-col gap-3">
      <h2 class="font-head text-xl font-semibold">Fonts</h2>
      <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div
          v-for="font in fontTokens"
          :key="font.name"
          class="flex flex-col gap-2 rounded-2xl border-2 border-line bg-surface p-4"
        >
          <p class="font-mono text-xs text-muted">{{ font.name }} · {{ font.use }}</p>
          <p class="text-3xl" :class="font.fontClass">Pursio +50 XP</p>
          <p :class="font.fontClass">The quick brown fox climbs the overhang.</p>
          <p class="truncate font-mono text-xs text-muted">{{ values[font.name] || '…' }}</p>
        </div>
      </div>
    </section>

    <section class="flex flex-col gap-3">
      <h2 class="font-head text-xl font-semibold">Raised buttons</h2>
      <div class="flex flex-wrap items-center gap-4 pb-2">
        <button
          type="button"
          class="min-h-12 rounded-2xl bg-primary px-6 font-head font-bold text-primary-ink uppercase shadow-raised-primary transition-transform active:translate-y-1.5 active:shadow-none"
        >
          Start skill
        </button>
        <button
          type="button"
          class="min-h-12 rounded-2xl bg-done px-6 font-head font-bold text-done-ink uppercase shadow-raised-done transition-transform active:translate-y-1.5 active:shadow-none"
        >
          Mark complete
        </button>
        <button
          type="button"
          disabled
          class="min-h-12 cursor-not-allowed rounded-2xl bg-locked px-6 font-head font-bold text-locked-ink uppercase shadow-raised-locked"
        >
          Locked
        </button>
        <button
          type="button"
          class="min-h-12 rounded-2xl border-3 border-dashed border-trail bg-surface px-6 font-head font-bold text-ink uppercase shadow-raised-line transition-transform active:translate-y-1.5 active:shadow-none"
        >
          Side quest
        </button>
        <button
          type="button"
          class="min-h-12 rounded-2xl bg-primary px-6 font-head font-bold text-primary-ink uppercase shadow-raised-primary motion-safe:animate-[pursio-unlock_450ms_ease-out]"
        >
          Unlock pop
        </button>
      </div>
    </section>

    <section class="flex flex-col gap-3">
      <h2 class="font-head text-xl font-semibold">Nodes</h2>
      <p class="font-mono text-xs text-muted">radius-node: {{ values['radius-node'] || '…' }}</p>
      <div class="flex flex-wrap items-end gap-10 pb-2">
        <figure class="flex flex-col items-center gap-3">
          <div class="flex size-18 items-center justify-center rounded-node bg-locked text-locked-ink shadow-raised-locked">
            <svg class="size-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="5" y="11" width="14" height="10" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
          </div>
          <figcaption class="font-head text-sm font-semibold text-muted">Locked</figcaption>
        </figure>

        <figure class="flex flex-col items-center gap-3">
          <div class="flex size-20 items-center justify-center rounded-node bg-primary text-primary-ink shadow-raised-primary outline-4 outline-offset-4 outline-primary-soft">
            <svg class="size-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />
            </svg>
          </div>
          <figcaption class="font-head text-sm font-semibold text-accent-text">Current</figcaption>
        </figure>

        <figure class="flex flex-col items-center gap-3">
          <div class="flex size-18 items-center justify-center rounded-node bg-done text-done-ink shadow-raised-done">
            <svg class="size-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="m5 12.5 4.5 4.5L19 7.5" />
            </svg>
          </div>
          <figcaption class="font-head text-sm font-semibold text-muted">Done</figcaption>
        </figure>
      </div>
    </section>

    <section class="flex flex-col gap-3">
      <h2 class="font-head text-xl font-semibold">Banner and overlay</h2>
      <div class="rounded-2xl bg-banner p-5 text-banner-ink shadow-raised-banner">
        <p class="font-head text-sm font-semibold text-banner-muted uppercase">Section 1</p>
        <p class="font-display text-3xl">Beginner</p>
      </div>
      <div class="relative mt-4 h-32 overflow-hidden rounded-2xl border-2 border-line bg-surface-2">
        <p class="p-4 font-head font-semibold">Content under the overlay</p>
        <div class="absolute inset-0 flex items-center justify-center bg-overlay">
          <p class="rounded-xl bg-surface px-4 py-2 font-head font-semibold text-ink">Bottom sheet goes here</p>
        </div>
      </div>
    </section>
  </main>
</template>
