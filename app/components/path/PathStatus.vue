<script setup lang="ts">
import { computed } from 'vue'

/** Loading skeleton or error message shown in place of the path (Req 5.11). */
const props = defineProps<{ state: 'loading' | 'error'; message?: string }>()

const text = computed(() => {
  if (props.message) return props.message
  return props.state === 'loading' ? 'Loading your path…' : 'This path could not be drawn.'
})

/** Horizontal node offsets in px, echoing the winding path. */
const NODE_OFFSETS = [0, -60, -88, -60, 0]
/** Trail dots drawn in the gap between two nodes, as fractions of the way down. */
const DOT_STEPS = [0.25, 0.5, 0.75]
/** Delay between neighbouring shapes, so the pulse travels down the path. */
const WAVE_MS = 140

const nodes = computed(() =>
  NODE_OFFSETS.map((x, index) => {
    const next = NODE_OFFSETS[index + 1]
    return {
      x,
      delay: `${(index + 1) * WAVE_MS}ms`,
      dots: next === undefined
        ? []
        : DOT_STEPS.map(t => ({ x: x + (next - x) * t, top: `${t * 100}%` })),
    }
  }),
)
</script>

<template>
  <div v-if="state === 'loading'" role="status" class="pursio-skeleton flex flex-col items-center px-4 pt-6 pb-14">
    <span class="sr-only">{{ text }}</span>

    <!-- Section banner -->
    <div
      aria-hidden="true"
      class="pursio-skeleton-pulse flex w-full items-center justify-between gap-4 rounded-3xl bg-locked px-4.5 py-4 shadow-raised-locked lg:px-5.5 lg:py-4.5"
    >
      <div class="flex flex-col gap-2.5">
        <span class="h-2.5 w-20 rounded-full bg-locked-deep/40" />
        <span class="h-5 w-40 rounded-full bg-locked-deep/40 lg:h-6" />
      </div>
      <span class="h-4 w-16 rounded-full bg-locked-deep/40" />
    </div>

    <p aria-hidden="true" class="mt-6 mb-8 text-[13px] font-extrabold tracking-[0.08em] text-muted uppercase">
      {{ text }}
    </p>

    <!-- Winding nodes joined by trail dots -->
    <div aria-hidden="true" class="flex flex-col items-center">
      <template v-for="(node, index) in nodes" :key="index">
        <span
          class="pursio-skeleton-pulse block size-18 rounded-node bg-locked shadow-raised-locked"
          :style="{ transform: `translateX(${node.x}px)`, animationDelay: node.delay }"
        />
        <div v-if="node.dots.length" class="relative h-12 w-full">
          <span
            v-for="(dot, dotIndex) in node.dots"
            :key="dotIndex"
            class="pursio-skeleton-pulse absolute left-1/2 size-2 -translate-1/2 rounded-full bg-trail"
            :style="{ top: dot.top, marginLeft: `${dot.x}px`, animationDelay: node.delay }"
          />
        </div>
      </template>
    </div>
  </div>
  <div v-else class="px-4 py-14">
    <p
      role="alert"
      class="mx-auto max-w-md rounded-2xl border-2 border-line bg-surface px-5 py-4 text-center text-[15px] font-bold text-ink"
    >
      {{ text }}
    </p>
  </div>
</template>

<style scoped>
/* Hold back briefly so fast loads never flash the skeleton. */
.pursio-skeleton {
  animation: pursio-skeleton-in 240ms ease-out 180ms both;
}

.pursio-skeleton-pulse {
  animation: pursio-skeleton-pulse 1.6s ease-in-out infinite;
}

@keyframes pursio-skeleton-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes pursio-skeleton-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.45;
  }
}

@media (prefers-reduced-motion: reduce) {
  .pursio-skeleton {
    animation: none;
  }
  .pursio-skeleton-pulse {
    animation: none;
    opacity: 0.8;
  }
}
</style>
