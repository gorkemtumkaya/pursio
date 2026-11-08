
<script setup lang="ts">
// Wick, the Pursio mascot.
// Usage: <Wick theme="boulder" mood="cheer" outfit="photography" :size="160" @cheer-end="..." />
import { computed, useId } from 'vue'
import { WICK_PALETTES, type WickMood, type WickOutfit, type WickTheme } from './wick'

const props = withDefaults(
  defineProps<{
    theme?: WickTheme
    mood?: WickMood
    /** Hobby outfit. 'none' shows the theme's own costume. */
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
  core: `wick-core-${uid}`,
  halo: `wick-halo-${uid}`,
}

const c = computed(() => WICK_PALETTES[props.theme] ?? WICK_PALETTES.boulder)
const height = computed(() => Math.round(props.size * 1.2))
const costume = computed(() => (props.outfit === 'none' ? props.theme : null))

const haloOpacity = computed(() => (props.mood === 'cheer' ? 0.95 : props.mood === 'sleep' ? 0.25 : 0.6))
const shadowRx = computed(() => (props.mood === 'cheer' ? 30 : 42))
const bodyTransform = computed(() =>
  props.mood === 'cheer' ? 'translate(0,-10)' : props.mood === 'sleep' ? 'translate(0,6) scale(1,0.97)' : undefined,
)

const ariaLabel = computed(() => {
  if (props.label) return props.label
  const moodText: Record<WickMood, string> = {
    idle: 'Wick, the lantern spirit',
    cheer: 'Wick cheering',
    think: 'Wick thinking',
    sleep: 'Wick sleeping',
  }
  return moodText[props.mood]
})

function onAnimationEnd(event: AnimationEvent) {
  if (event.animationName.includes('wick-jump')) emit('cheer-end')
}
</script>

<template>
  <svg
    class="wick"
    :class="[`wick--${mood}`, { 'wick--still': !animated }]"
    :width="size"
    :height="height"
    viewBox="0 0 200 240"
    role="img"
    :aria-label="ariaLabel"
    @animationend="onAnimationEnd"
  >
    <defs>
      <linearGradient :id="ids.body" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" :stop-color="c.top" />
        <stop offset="1" :stop-color="c.bot" />
      </linearGradient>
      <radialGradient :id="ids.core" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" :stop-color="c.core" />
        <stop offset="0.55" :stop-color="c.inner" stop-opacity="0.85" />
        <stop offset="1" :stop-color="c.inner" stop-opacity="0" />
      </radialGradient>
      <radialGradient :id="ids.halo" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" :stop-color="c.glow" :stop-opacity="haloOpacity" />
        <stop offset="1" :stop-color="c.glow" stop-opacity="0" />
      </radialGradient>
    </defs>

    <circle class="wick-halo" cx="100" cy="128" r="104" :fill="`url(#${ids.halo})`" />
    <ellipse cx="100" cy="232" :rx="shadowRx" ry="5" :fill="c.shadow" opacity="0.16" />

    <!-- Everything inside moves together (float / jump / breathe) -->
    <g class="wick-float">
      <g :transform="bodyTransform">
        <!-- Arms -->
        <g v-if="mood === 'cheer'" class="wick-arms-up">
          <path d="M46 134 C 26 120, 20 98, 30 78 C 34 96, 42 106, 54 114 Z" :fill="`url(#${ids.body})`" />
          <path d="M154 134 C 174 120, 180 98, 170 78 C 166 96, 158 106, 146 114 Z" :fill="`url(#${ids.body})`" />
        </g>
        <g v-else>
          <path d="M44 156 C 30 156, 25 144, 30 134 C 35 143, 40 146, 48 146 Z" :fill="`url(#${ids.body})`" />
          <path d="M156 156 C 170 156, 175 144, 170 134 C 165 143, 160 146, 152 146 Z" :fill="`url(#${ids.body})`" />
        </g>

        <!-- Flame tip, body, glowing core, highlights -->
        <path class="wick-tip" d="M128 60 C 138 50, 137 38, 130 28 C 146 38, 150 54, 142 68 Z" :fill="`url(#${ids.body})`" />
        <path
          d="M100 18 C 107 38, 124 46, 134 64 C 152 84, 166 106, 166 142 C 166 180, 137 204, 100 204 C 63 204, 34 180, 34 142 C 34 112, 50 92, 68 76 C 79 66, 84 56, 82 42 C 92 50, 97 34, 100 18 Z"
          :fill="`url(#${ids.body})`"
        />
        <ellipse cx="100" cy="152" rx="50" ry="44" :fill="`url(#${ids.core})`" />
        <path d="M56 128 C 54 108, 62 92, 76 80" fill="none" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round" opacity="0.45" />
        <circle cx="62" cy="144" r="3" fill="#FFFFFF" opacity="0.5" />

        <!-- Faces -->
        <g v-if="mood === 'idle'">
          <g class="wick-eyes">
            <ellipse cx="82" cy="140" rx="8.5" ry="11.5" :fill="c.ink" />
            <ellipse cx="118" cy="140" rx="8.5" ry="11.5" :fill="c.ink" />
            <circle cx="85" cy="135" r="3.4" fill="#FFFFFF" />
            <circle cx="121" cy="135" r="3.4" fill="#FFFFFF" />
            <circle cx="79.5" cy="145" r="1.6" fill="#FFFFFF" />
            <circle cx="115.5" cy="145" r="1.6" fill="#FFFFFF" />
          </g>
          <path d="M92 160 q8 8 16 0" fill="none" :stroke="c.ink" stroke-width="3.6" stroke-linecap="round" />
        </g>
        <g v-else-if="mood === 'cheer'">
          <path d="M72 143 q10 -13 20 0" fill="none" :stroke="c.ink" stroke-width="4.6" stroke-linecap="round" />
          <path d="M108 143 q10 -13 20 0" fill="none" :stroke="c.ink" stroke-width="4.6" stroke-linecap="round" />
          <path d="M85 153 q15 22 30 0 z" :fill="c.ink" />
          <ellipse cx="100" cy="163" rx="7" ry="4" :fill="c.tongue" />
        </g>
        <g v-else-if="mood === 'sleep'">
          <path d="M72 141 q10 7 20 0" fill="none" :stroke="c.ink" stroke-width="4.4" stroke-linecap="round" />
          <path d="M108 141 q10 7 20 0" fill="none" :stroke="c.ink" stroke-width="4.4" stroke-linecap="round" />
          <ellipse cx="100" cy="161" rx="4.5" ry="3.5" :fill="c.ink" />
        </g>
        <g v-else>
          <ellipse cx="84" cy="136" rx="7.5" ry="10" :fill="c.ink" />
          <ellipse cx="120" cy="136" rx="7.5" ry="10" :fill="c.ink" />
          <circle cx="86.5" cy="131" r="3" fill="#FFFFFF" />
          <circle cx="122.5" cy="131" r="3" fill="#FFFFFF" />
          <circle cx="106" cy="160" r="4.5" :fill="c.ink" />
        </g>
        <circle cx="68" cy="158" r="8" :fill="c.cheek" opacity="0.55" />
        <circle cx="132" cy="158" r="8" :fill="c.cheek" opacity="0.55" />

        <!-- Theme costumes (only when no hobby outfit) -->
        <g v-if="costume === 'trail'">
          <path d="M68 74 C 70 48, 130 48, 132 74 Z" fill="#3C7A5A" />
          <path d="M56 76 C 80 67, 120 67, 144 76 C 120 85, 80 85, 56 76 Z" fill="#2C5E45" />
          <rect x="70" y="63" width="60" height="6" fill="#F2B33D" />
          <path d="M124 64 C 130 52, 138 46, 148 44" fill="none" stroke="#FF6A3D" stroke-width="3.5" stroke-linecap="round" />
        </g>
        <g v-else-if="costume === 'boulder' || outfit === 'bouldering'">
          <path d="M40 118 C 70 103, 130 103, 160 118" fill="none" stroke="#C63F23" stroke-width="9" stroke-linecap="round" />
          <path d="M160 116 C 168 108, 176 112, 182 104 M160 119 C 170 122, 175 130, 183 128" fill="none" stroke="#C63F23" stroke-width="5" stroke-linecap="round" />
          <path d="M54 170 C 90 190, 130 190, 156 176" fill="none" stroke="#3A2E26" stroke-width="3" />
          <rect x="150" y="170" width="34" height="38" rx="11" fill="#C63F23" />
          <rect x="148" y="166" width="38" height="10" rx="5" fill="#F8F4EE" />
          <circle cx="158" cy="158" r="4.5" fill="#FFFFFF" />
          <circle cx="170" cy="151" r="3.2" fill="#FFFFFF" />
          <circle cx="179" cy="159" r="2.6" fill="#FFFFFF" />
          <ellipse cx="62" cy="152" rx="7" ry="4" fill="#FFFFFF" opacity="0.6" />
        </g>
        <g v-else-if="costume === 'halloween'">
          <path d="M64 76 C 80 62, 90 34, 118 6 C 110 32, 118 54, 136 76 Z" fill="#3B1F66" />
          <path d="M48 78 C 76 67, 124 67, 152 78 C 124 89, 76 89, 48 78 Z" fill="#1C0D33" />
          <rect x="72" y="65" width="56" height="7" fill="#FF7A1A" />
          <rect x="94" y="64" width="12" height="9" rx="2" fill="none" stroke="#FFE08A" stroke-width="2.5" />
        </g>

        <!-- Hobby outfits -->
        <g v-else-if="outfit === 'photography'">
          <ellipse cx="94" cy="64" rx="42" ry="14" fill="#2A2A2E" />
          <circle cx="90" cy="49" r="4.5" fill="#2A2A2E" />
          <path d="M66 112 C 82 150, 112 162, 128 164" fill="none" stroke="#2A2A2E" stroke-width="3" />
          <rect x="120" y="160" width="58" height="40" rx="9" fill="#2A2A2E" />
          <rect x="132" y="152" width="20" height="11" rx="3" fill="#2A2A2E" />
          <rect x="162" y="165" width="10" height="6" rx="2" fill="#F2B33D" />
          <circle cx="149" cy="181" r="13" fill="#4A4A52" stroke="#9AA0A8" stroke-width="3" />
          <circle cx="149" cy="181" r="5.5" fill="#141416" />
          <circle cx="146" cy="178" r="2" fill="#FFFFFF" opacity="0.8" />
        </g>
        <g v-else-if="outfit === 'cooking'">
          <rect x="74" y="50" width="52" height="22" rx="5" fill="#FFFFFF" stroke="#D3DBD0" stroke-width="2" />
          <circle cx="80" cy="42" r="16" fill="#FFFFFF" stroke="#D3DBD0" stroke-width="2" />
          <circle cx="120" cy="42" r="16" fill="#FFFFFF" stroke="#D3DBD0" stroke-width="2" />
          <circle cx="100" cy="32" r="19" fill="#FFFFFF" stroke="#D3DBD0" stroke-width="2" />
          <rect x="76" y="48" width="48" height="12" fill="#FFFFFF" />
          <path d="M164 182 L188 124" stroke="#B07A45" stroke-width="6" stroke-linecap="round" />
          <ellipse cx="190" cy="116" rx="8" ry="12" fill="#C98A50" transform="rotate(22 190 116)" />
          <path d="M58 188 C 70 196, 86 198, 96 196" fill="none" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round" opacity="0.8" />
        </g>
        <g v-else-if="outfit === 'guitar'">
          <path d="M44 128 C 42 66, 158 66, 156 128" fill="none" stroke="#2A2A2E" stroke-width="7" stroke-linecap="round" />
          <rect x="32" y="116" width="16" height="30" rx="7" fill="#2A2A2E" />
          <rect x="152" y="116" width="16" height="30" rx="7" fill="#2A2A2E" />
          <path d="M92 166 L144 104" stroke="#6B3F1D" stroke-width="9" stroke-linecap="round" />
          <rect x="138" y="90" width="14" height="20" rx="3" fill="#6B3F1D" transform="rotate(40 145 100)" />
          <circle cx="66" cy="190" r="22" fill="#C6763A" />
          <circle cx="84" cy="172" r="16" fill="#C6763A" />
          <circle cx="74" cy="182" r="6" fill="#3A2214" />
          <path d="M168 60 v-18 l10 -3 v16" fill="none" :stroke="c.soft" stroke-width="3" stroke-linecap="round" />
          <circle cx="165" cy="60" r="4" :fill="c.soft" />
          <circle cx="175" cy="57" r="4" :fill="c.soft" />
        </g>
        <g v-else-if="outfit === 'gardening'">
          <path d="M70 72 C 72 48, 128 48, 130 72 Z" fill="#E8C46A" />
          <ellipse cx="100" cy="74" rx="60" ry="11" fill="#D9AE4A" />
          <rect x="72" y="62" width="56" height="7" fill="#4E9A5E" />
          <path d="M128 60 C 136 46, 148 46, 152 40 C 146 52, 138 58, 128 60 Z" fill="#4E9A5E" />
          <rect x="140" y="170" width="40" height="30" rx="7" fill="#4E9AB0" />
          <path d="M178 176 L196 160" stroke="#4E9AB0" stroke-width="6" stroke-linecap="round" />
          <path d="M148 172 C 148 156, 172 156, 172 172" fill="none" stroke="#3B7C8F" stroke-width="5" />
          <circle cx="198" cy="166" r="2" fill="#7FC4D6" />
          <circle cx="194" cy="174" r="2" fill="#7FC4D6" />
        </g>
        <g v-else-if="outfit === 'reading'">
          <circle cx="82" cy="140" r="15" fill="none" stroke="#3A2E26" stroke-width="3.5" />
          <circle cx="118" cy="140" r="15" fill="none" stroke="#3A2E26" stroke-width="3.5" />
          <path d="M97 139 q3 -3 6 0 M67 136 L52 130 M133 136 L148 130" fill="none" stroke="#3A2E26" stroke-width="3.5" stroke-linecap="round" />
          <path d="M60 182 L100 192 L140 182 L140 208 L100 218 L60 208 Z" fill="#1E8C6E" />
          <path d="M64 178 L100 188 L100 212 L64 202 Z" fill="#FFFFFF" />
          <path d="M136 178 L100 188 L100 212 L136 202 Z" fill="#F4F1E8" />
          <path d="M72 188 L94 194 M72 195 L94 201 M128 188 L106 194 M128 195 L106 201" stroke="#BAC3B6" stroke-width="2" />
        </g>
        <g v-else-if="outfit === 'explorer'">
          <path d="M66 72 C 68 44, 132 44, 134 72 Z" fill="#CDB48A" />
          <ellipse cx="100" cy="74" rx="58" ry="10" fill="#B39A6E" />
          <rect x="68" y="62" width="64" height="7" fill="#6F5A45" />
          <path d="M66 112 C 90 150, 130 160, 150 162" fill="none" stroke="#6F5A45" stroke-width="3" />
          <circle cx="152" cy="178" r="15" fill="#F2B33D" stroke="#B47D0E" stroke-width="3" />
          <path d="M152 168 L156 178 L152 188 L148 178 Z" fill="#C63F23" />
        </g>
      </g>
    </g>

    <!-- Extras around Wick -->
    <g v-if="mood === 'idle' || mood === 'cheer'" class="wick-sparks" :fill="c.spark">
      <path d="M30 60 l2.2 -6 2.2 6 6 2.2 -6 2.2 -2.2 6 -2.2 -6 -6 -2.2 z" />
      <path d="M168 168 l1.8 -5 1.8 5 5 1.8 -5 1.8 -1.8 5 -1.8 -5 -5 -1.8 z" />
      <path d="M176 40 l1.5 -4 1.5 4 4 1.5 -4 1.5 -1.5 4 -1.5 -4 -4 -1.5 z" />
      <path d="M22 178 l1.5 -4 1.5 4 4 1.5 -4 1.5 -1.5 4 -1.5 -4 -4 -1.5 z" />
    </g>
    <path
      v-if="theme === 'halloween' && mood !== 'sleep'"
      d="M150 34 c4 -6 8 -6 10 -2 c2 -6 6 -6 8 0 c2 -4 6 -4 10 2 c-6 0 -8 4 -10 6 c-2 -2 -4 -2 -8 0 c-2 -2 -4 -6 -10 -6 z"
      fill="#9B5CFF"
    />
    <g v-if="mood === 'sleep'" class="wick-zz" :fill="c.soft" font-family="Fredoka, sans-serif" font-weight="600">
      <text x="148" y="70" font-size="30">z</text>
      <text x="168" y="46" font-size="21">z</text>
    </g>
    <g v-if="mood === 'think'" class="wick-dots" :fill="c.soft">
      <circle cx="142" cy="66" r="3.5" />
      <circle cx="154" cy="56" r="4.5" />
      <circle cx="168" cy="44" r="6" />
    </g>
  </svg>
</template>

<style scoped>
.wick {
  display: block;
  overflow: visible;
}

/* Rotate / scale around fixed points in the 200x240 drawing */
.wick-tip,
.wick-eyes,
.wick-float,
.wick-zz,
.wick-dots circle {
  transform-box: view-box;
}
.wick-tip { transform-origin: 136px 62px; }
.wick-eyes { transform-origin: 100px 140px; }
.wick-float { transform-origin: 100px 204px; }

/* Idle: float, flicker, breathing glow, blink */
.wick--idle .wick-float { animation: wick-float 3s ease-in-out infinite; }
.wick--idle .wick-tip,
.wick--cheer .wick-tip,
.wick--think .wick-tip { animation: wick-flicker 1.6s ease-in-out infinite; }
.wick--idle .wick-halo,
.wick--think .wick-halo { animation: wick-glow 2.6s ease-in-out infinite; }
.wick--idle .wick-eyes { animation: wick-blink 4.2s infinite; }
.wick--idle .wick-sparks { animation: wick-twinkle 2.6s ease-in-out infinite; }

/* Cheer: one jump with squash, sparkle burst (emits cheer-end) */
.wick--cheer .wick-float { animation: wick-jump 1.1s cubic-bezier(0.3, 0.7, 0.4, 1) 1; }
.wick--cheer .wick-halo { animation: wick-flash 1.1s ease-out 1; }
.wick--cheer .wick-sparks { animation: wick-burst 1.1s ease-out 1 both; }

/* Think: slow float, pulsing dots */
.wick--think .wick-float { animation: wick-float 4.5s ease-in-out infinite; }
.wick--think .wick-dots circle { animation: wick-dot 1.2s ease-in-out infinite; opacity: 0.25; }
.wick--think .wick-dots circle:nth-child(2) { animation-delay: 0.2s; }
.wick--think .wick-dots circle:nth-child(3) { animation-delay: 0.4s; }

/* Sleep: slow breathing, dim glow, drifting z's */
.wick--sleep .wick-float { animation: wick-breathe 5s ease-in-out infinite; }
.wick--sleep .wick-halo { animation: wick-glow-dim 5s ease-in-out infinite; }
.wick--sleep .wick-zz { animation: wick-zz 2.8s ease-in-out infinite; }

@keyframes wick-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-7px); } }
@keyframes wick-breathe { 0%, 100% { transform: translateY(2px) scaleY(0.98); } 50% { transform: translateY(-1px) scaleY(1); } }
@keyframes wick-flicker { 0%, 100% { transform: rotate(0deg); } 33% { transform: rotate(9deg); } 66% { transform: rotate(-5deg); } }
@keyframes wick-glow { 0%, 100% { opacity: 0.75; } 50% { opacity: 1; } }
@keyframes wick-glow-dim { 0%, 100% { opacity: 0.5; } 50% { opacity: 0.8; } }
@keyframes wick-flash { 0% { opacity: 0.7; } 30% { opacity: 1; } 100% { opacity: 0.85; } }
@keyframes wick-blink { 0%, 90%, 98%, 100% { transform: scaleY(1); } 94% { transform: scaleY(0.1); } }
@keyframes wick-twinkle { 0%, 100% { opacity: 0.35; } 50% { opacity: 1; } }
@keyframes wick-burst { 0% { opacity: 0; } 25% { opacity: 1; } 100% { opacity: 0.2; } }
@keyframes wick-dot { 0%, 100% { opacity: 0.25; } 50% { opacity: 1; } }
@keyframes wick-zz { 0% { opacity: 0; transform: translateY(10px); } 25% { opacity: 1; } 70% { opacity: 1; } 100% { opacity: 0; transform: translateY(-14px); } }
@keyframes wick-jump {
  0% { transform: translateY(0) scale(1, 1); }
  15% { transform: translateY(2px) scale(1.06, 0.92); }
  45% { transform: translateY(-22px) scale(0.96, 1.05); }
  70% { transform: translateY(2px) scale(1.05, 0.94); }
  100% { transform: translateY(0) scale(1, 1); }
}

/* Motion off: by prop, or when the user asks for reduced motion */
.wick--still *,
.wick--still { animation: none !important; }
@media (prefers-reduced-motion: reduce) {
  .wick *,
  .wick { animation: none !important; }
}
</style>