<script setup lang="ts">
import { computed, resolveComponent } from 'vue'

/**
 * The primary raised button: red, with the solid bottom shadow. One look for a `<button>`,
 * an in-app link (`to`) and a plain link (`href`). `class`, listeners and attributes such
 * as `disabled` fall through to the element, so a caller adds layout (width, margin) there.
 *
 * `bouncy` adds a springy lift on hover and a press on click, for the buttons that should
 * invite a click. It is off under reduced motion and on a disabled button.
 */
const props = withDefaults(
  defineProps<{
    /** In-app route: renders a NuxtLink. */
    to?: string
    /** Plain link, such as `#top`: renders an `<a>`. */
    href?: string
    /** Only for a `<button>`. */
    type?: 'button' | 'submit'
    /** `sm` is the smallest that keeps a 44 px tap target, for tight bars. */
    size?: 'sm' | 'md' | 'lg'
    bouncy?: boolean
  }>(),
  { to: undefined, href: undefined, type: 'button', size: 'lg', bouncy: false },
)

const tag = computed(() => (props.to !== undefined ? resolveComponent('NuxtLink') : props.href !== undefined ? 'a' : 'button'))
const linkProps = computed(() =>
  props.to !== undefined ? { to: props.to } : props.href !== undefined ? { href: props.href } : { type: props.type },
)

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-2xl bg-primary font-head font-semibold whitespace-nowrap text-primary-ink ' +
  'shadow-[0_5px_0_var(--pursio-primary-deep)] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary ' +
  'disabled:cursor-not-allowed disabled:opacity-60'
const SIZE = { sm: 'h-11 px-4 text-[15px]', md: 'h-12 px-6 text-base', lg: 'h-14 px-8 text-lg' } as const
/** The `bouncy` utility of main.css, told that this button's shadow is 5 px deep. */
const BOUNCY = 'bouncy [--bouncy-depth:5px]'
</script>

<template>
  <component :is="tag" v-bind="linkProps" :class="[BASE, SIZE[size], bouncy ? BOUNCY : '']">
    <slot />
  </component>
</template>
