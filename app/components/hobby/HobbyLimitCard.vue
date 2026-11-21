<script setup lang="ts">
import { track } from '~/utils/analytics'
import { HOBBY_LIMIT_COPY, hobbyLimitHeading } from '~/utils/hobby-limit-copy'

/**
 * Shown on the new hobby page in place of the form when a free account has
 * reached its limit of active hobbies. It is an offer, not an error: archive
 * a hobby, or become a founding member for unlimited hobbies. When founding
 * spots are gone (or checkout is not open) only the archive option is shown.
 */
defineProps<{
  /** Active hobbies the account has now. */
  count: number
  /** Where "Manage my hobbies" goes: the path page, whose hobby list has Archive. */
  manageTo: string
}>()

const { canCheckout, available, busy, failed, open } = useFoundingCheckout()
const offerFounding = computed(() => canCheckout && available.value)

function becomeFoundingMember(): void {
  track('hobby_limit_checkout_clicked')
  void open()
}

const FOCUS = 'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary'
const BUTTON = 'flex h-[58px] w-full items-center justify-center rounded-[18px] font-head text-[19px] font-semibold'
</script>

<template>
  <section aria-labelledby="hobby-limit-title" class="flex flex-col gap-4">
    <h2 id="hobby-limit-title" class="font-display text-[26px] leading-tight font-semibold text-ink">
      {{ hobbyLimitHeading(count) }}
    </h2>
    <p class="text-base leading-normal font-bold text-muted">
      {{ offerFounding ? HOBBY_LIMIT_COPY.textWithFounding : HOBBY_LIMIT_COPY.textArchiveOnly }}
    </p>
    <div class="flex flex-col gap-3">
      <button
        v-if="offerFounding"
        type="button"
        :aria-disabled="busy ? 'true' : undefined"
        :class="[BUTTON, FOCUS, 'cursor-pointer bg-primary text-primary-ink shadow-raised-primary aria-disabled:opacity-70']"
        @click="becomeFoundingMember"
      >
        {{ HOBBY_LIMIT_COPY.foundingCta }}
      </button>
      <NuxtLink :to="manageTo" :class="[BUTTON, FOCUS, 'border-2 border-line bg-surface text-ink hover:border-ink']">
        {{ HOBBY_LIMIT_COPY.manageCta }}
      </NuxtLink>
    </div>
    <p v-if="failed" role="alert" class="text-sm font-bold text-danger-text">{{ HOBBY_LIMIT_COPY.checkoutFailed }}</p>
  </section>
</template>
