<script setup lang="ts">
import { PRICING_COPY } from '~/utils/pricing-copy'
import type { BillingFrequency } from '~/utils/pricing-tiers'

/** Monthly / yearly switch on /pricing. Native radios, so arrow keys and screen readers work as usual. */
const model = defineModel<BillingFrequency>({ required: true })

const OPTIONS: readonly { value: BillingFrequency; label: string }[] = [
  { value: 'month', label: PRICING_COPY.monthly },
  { value: 'year', label: PRICING_COPY.yearly },
]
</script>

<template>
  <fieldset class="inline-flex rounded-2xl border-2 border-line bg-surface p-1">
    <legend class="sr-only">{{ PRICING_COPY.frequencyLabel }}</legend>
    <label
      v-for="option in OPTIONS"
      :key="option.value"
      class="relative flex min-h-11 cursor-pointer items-center rounded-xl px-5 text-[15px] font-extrabold has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary"
      :class="model === option.value ? 'bg-primary text-primary-ink' : 'text-muted hover:text-ink'"
    >
      <input v-model="model" type="radio" name="billing-frequency" :value="option.value" class="sr-only" />
      {{ option.label }}
    </label>
  </fieldset>
</template>
