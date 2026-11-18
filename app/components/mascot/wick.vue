<script setup lang="ts">
// Wick, the Pursio mascot (drawing: Wick v2, dev_docs/wick-v2).
// Usage: <Wick theme="boulder" mood="cheer" outfit="photography" :size="160" @cheer-end="..." />
// The faces and accessories come from app/utils/wick-art.ts, which
// scripts/build-wick-art.mjs builds from the design files.
import { computed, useId } from 'vue'
import { WICK_PALETTES, type WickMood, type WickOutfit, type WickTheme } from '~/utils/wick'
import { WICK_ACCESSORY_ART, WICK_FACE_ART, WICK_SPARKS_ART, type WickFaceArt } from '~/utils/wick-art'

const props = withDefaults(
  defineProps<{
    theme?: WickTheme
    mood?: WickMood
    /** Hobby outfit. 'none' shows Wick bare, or in the costume of the trail and halloween themes. */
    outfit?: WickOutfit
    /** Width in px; height is size * 1.2 */
    size?: number
    /** Turn motion off (it is also off when the user prefers reduced motion) */
    animated?: boolean
    /** Accessible name; defaults to a description of the mood */
    label?: string
  }>(),
  { theme: 'boulder', mood: 'idle', outfit: 'none', size: 160, animated: true, label: undefined },
)

const emit = defineEmits<{ 'cheer-end': [] }>()

const uid = useId()
const ids = {
  body: `wick-body-${uid}`,
  shine: `wick-shine-${uid}`,
  core: `wick-core-${uid}`,
}

const BODY =
  'M150 33.75C184.65 83.25 249 127.8 249 202.05C249 261.45 204.45 306 150 306C95.55 306 51 261.45 51 202.05C51 157.5 75.75 127.8 100.5 108C105.45 132.75 115.35 147.6 130.2 152.55C120.3 108 130.2 68.4 150 33.75Z'

const c = computed(() => WICK_PALETTES[props.theme] ?? WICK_PALETTES.boulder)
const height = computed(() => Math.round(props.size * 1.2))
const face = computed<WickFaceArt>(() => WICK_FACE_ART[props.mood === 'cheer' ? 'happy' : props.mood])
const accessory = computed(() => (props.outfit === 'none' ? '' : WICK_ACCESSORY_ART[props.outfit]))
const costume = computed(() => (props.outfit === 'none' ? props.theme : null))

/** Theme colors read by the art fragments. */
const colors = computed(() => ({
  '--wick-ink': c.value.ink,
  '--wick-cheek': c.value.cheek,
  '--wick-tongue': c.value.tongue,
  '--wick-spark': c.value.spark,
  '--wick-ember': c.value.ember,
  '--wick-soft': c.value.soft,
}))

const ariaLabel = computed(() => {
  if (props.label) return props.label
  const moodText: Record<WickMood, string> = {
    idle: 'Wick, the lantern spirit',
    cheer: 'Wick cheering',
    happy: 'Wick, happy',
    proud: 'Wick, proud',
    encourage: 'Wick cheering you on',
    focus: 'Wick, focused',
    surprised: 'Wick, surprised',
    think: 'Wick thinking',
    sleep: 'Wick sleeping',
  }
  return moodText[props.mood]
})

function onAnimationEnd(event: AnimationEvent) {
  if (event.animationName.includes('wick-jump')) emit('cheer-end')
}
</script>

<!-- eslint-disable vue/no-v-html -- the fragments are static strings generated from the design files -->
<template>
  <svg
    class="wick"
    :class="[`wick--${mood}`, { 'wick--still': !animated }]"
    :style="colors"
    :width="size"
    :height="height"
    viewBox="0 0 300 360"
    fill="none"
    role="img"
    :aria-label="ariaLabel"
    @animationend="onAnimationEnd"
  >
    <defs>
      <linearGradient :id="ids.body" x1="51" y1="33.75" x2="51" y2="306" gradientUnits="userSpaceOnUse">
        <stop :stop-color="c.top" />
        <stop offset="0.55" :stop-color="c.mid" />
        <stop offset="1" :stop-color="c.bot" />
      </linearGradient>
      <radialGradient
        :id="ids.shine"
        cx="0"
        cy="0"
        r="1"
        gradientUnits="userSpaceOnUse"
        gradientTransform="translate(122.28 115.425) scale(108.9 149.737)"
      >
        <stop stop-color="#FFFFFF" stop-opacity="0.26" />
        <stop offset="1" stop-color="#FFFFFF" stop-opacity="0" />
      </radialGradient>
      <radialGradient
        :id="ids.core"
        cx="0"
        cy="0"
        r="1"
        gradientUnits="userSpaceOnUse"
        gradientTransform="translate(150 216) scale(87 78)"
      >
        <stop :stop-color="c.core" />
        <stop offset="0.6" :stop-color="c.inner" />
        <stop offset="1" :stop-color="c.edge" stop-opacity="0" />
      </radialGradient>
    </defs>

    <ellipse cx="150" cy="345" rx="66" ry="7.5" :fill="c.shadow" opacity="0.14" />

    <!-- Everything inside moves together (float / jump / breathe) -->
    <g class="wick-float">
      <path :d="BODY" :fill="`url(#${ids.body})`" />
      <path :d="BODY" :fill="`url(#${ids.shine})`" />
      <ellipse cx="150" cy="216" rx="87" ry="78" :fill="`url(#${ids.core})`" />

      <g v-html="face.marks" />
      <g v-if="face.eyes" class="wick-eyes" v-html="face.eyes" />

      <!-- Theme costumes, drawn for the first Wick at two thirds of this size -->
      <g v-if="costume === 'trail'" transform="scale(1.5)">
        <path d="M68 74 C 70 48, 130 48, 132 74 Z" fill="#3C7A5A" />
        <path d="M56 76 C 80 67, 120 67, 144 76 C 120 85, 80 85, 56 76 Z" fill="#2C5E45" />
        <rect x="70" y="63" width="60" height="6" fill="#F2B33D" />
        <path d="M124 64 C 130 52, 138 46, 148 44" stroke="#FF6A3D" stroke-width="3.5" stroke-linecap="round" />
      </g>
      <g v-else-if="costume === 'halloween'" transform="scale(1.5)">
        <path d="M64 76 C 80 62, 90 34, 118 6 C 110 32, 118 54, 136 76 Z" fill="#3B1F66" />
        <path d="M48 78 C 76 67, 124 67, 152 78 C 124 89, 76 89, 48 78 Z" fill="#1C0D33" />
        <rect x="72" y="65" width="56" height="7" fill="#FF7A1A" />
        <rect x="94" y="64" width="12" height="9" rx="2" stroke="#FFE08A" stroke-width="2.5" />
      </g>

      <g v-if="accessory" v-html="accessory" />
    </g>

    <!-- Extras around Wick -->
    <g v-if="face.sparks" class="wick-sparks" v-html="WICK_SPARKS_ART" />
    <g v-if="face.dots" class="wick-dots" v-html="face.dots" />
  </svg>
</template>

<style scoped>
.wick {
  display: block;
  overflow: visible;
}

/* Rotate / scale around fixed points in the 300x360 drawing */
.wick-eyes,
.wick-float,
.wick-dots :deep(path) {
  transform-box: view-box;
}
.wick-eyes { transform-origin: 150px 198px; }
.wick-float { transform-origin: 150px 306px; }

/* Calm faces: float and twinkle. Idle also blinks. */
.wick--idle .wick-float,
.wick--happy .wick-float,
.wick--proud .wick-float,
.wick--encourage .wick-float,
.wick--surprised .wick-float { animation: wick-float 3s ease-in-out infinite; }
.wick--idle .wick-eyes { animation: wick-blink 4.2s infinite; }
.wick .wick-sparks { animation: wick-twinkle 2.6s ease-in-out infinite; }

/* Cheer: one jump with squash, sparkle burst (emits cheer-end) */
.wick--cheer .wick-float { animation: wick-jump 1.1s cubic-bezier(0.3, 0.7, 0.4, 1) 1; }
.wick--cheer .wick-sparks { animation: wick-burst 1.1s ease-out 1 both; }

/* Think and focus: slow float; think has pulsing dots */
.wick--think .wick-float,
.wick--focus .wick-float { animation: wick-float 4.5s ease-in-out infinite; }
.wick--think .wick-dots :deep(path) { animation: wick-dot 1.2s ease-in-out infinite; }
.wick--think .wick-dots :deep(path:nth-child(2)) { animation-delay: 0.2s; }
.wick--think .wick-dots :deep(path:nth-child(3)) { animation-delay: 0.4s; }

/* Sleep: slow breathing */
.wick--sleep .wick-float { animation: wick-breathe 5s ease-in-out infinite; }

@keyframes wick-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
@keyframes wick-breathe { 0%, 100% { transform: translateY(3px) scaleY(0.98); } 50% { transform: translateY(-1px) scaleY(1); } }
@keyframes wick-blink { 0%, 90%, 98%, 100% { transform: scaleY(1); } 94% { transform: scaleY(0.1); } }
@keyframes wick-twinkle { 0%, 100% { opacity: 0.35; } 50% { opacity: 1; } }
@keyframes wick-burst { 0% { opacity: 0; } 25% { opacity: 1; } 100% { opacity: 0.2; } }
@keyframes wick-dot { 0%, 100% { opacity: 0.25; } 50% { opacity: 1; } }
@keyframes wick-jump {
  0% { transform: translateY(0) scale(1, 1); }
  15% { transform: translateY(3px) scale(1.06, 0.92); }
  45% { transform: translateY(-33px) scale(0.96, 1.05); }
  70% { transform: translateY(3px) scale(1.05, 0.94); }
  100% { transform: translateY(0) scale(1, 1); }
}

/* Motion off: by prop, or when the user asks for reduced motion */
.wick--still :deep(*),
.wick--still *,
.wick--still { animation: none !important; }
@media (prefers-reduced-motion: reduce) {
  .wick :deep(*),
  .wick *,
  .wick { animation: none !important; }
}
</style>
