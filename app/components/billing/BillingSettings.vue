<script setup lang="ts">
import type { BillingStatusResponse } from '#shared/types/billing'
import { bearerHeader } from '#shared/utils/auth'
import { billingSummary, BILLING_COPY } from '~/utils/billing-copy'

/**
 * Subscription group on the Settings_Page: the plan and its state from the
 * server's Paddle mirror, and "Manage subscription", which opens the
 * Paddle-hosted customer portal (payment method, cancel, invoices).
 */
const auth = useAuth()

type LoadState = 'loading' | 'ready' | 'failed'
const state = ref<LoadState>('loading')
const status = ref<BillingStatusResponse | null>(null)
const portalBusy = ref(false)
const portalError = ref<string | null>(null)

const ready = computed(() => auth.status.value === 'anonymous' || auth.status.value === 'signed_in')
const summary = computed(() => (status.value ? billingSummary(status.value) : null))

function isStatus(value: unknown): value is BillingStatusResponse {
  return typeof value === 'object' && value !== null && typeof (value as Record<string, unknown>).access === 'boolean'
}

async function load(): Promise<void> {
  state.value = 'loading'
  try {
    const token = await auth.accessToken()
    if (token === null) throw new Error('no_token')
    const response = await $fetch<unknown>('/api/billing/status', { headers: bearerHeader(token), retry: 0 })
    if (!isStatus(response)) throw new Error('bad_response')
    status.value = response
    state.value = 'ready'
  } catch {
    state.value = 'failed'
  }
}

watch(ready, (now) => {
  if (now) void load()
}, { immediate: true })

/** Mints a fresh portal session on every click; the URL is one-time use, so it is never kept. */
async function openPortal(): Promise<void> {
  if (portalBusy.value) return
  portalBusy.value = true
  portalError.value = null
  try {
    const token = await auth.accessToken()
    if (token === null) throw new Error('no_token')
    const response = await $fetch<unknown>('/api/billing/portal', { method: 'POST', headers: bearerHeader(token), retry: 0 })
    const url: unknown = typeof response === 'object' && response !== null ? (response as Record<string, unknown>).url : null
    if (typeof url !== 'string' || !url.startsWith('https://')) throw new Error('bad_response')
    window.location.assign(url)
  } catch {
    portalError.value = BILLING_COPY.portalFailed
    portalBusy.value = false
  }
}

const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'
const rowTitleClass = 'text-base font-extrabold break-words text-ink'
const rowHintClass = 'text-[13px] font-bold break-words text-muted'
const buttonClass = [
  'flex h-11 shrink-0 items-center justify-center rounded-2xl border-2 border-line bg-surface px-4 font-head text-[15px] font-semibold text-ink hover:border-ink disabled:opacity-60',
  focusRing,
]
</script>

<template>
  <div class="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 lg:px-5">
    <span class="flex min-w-0 flex-[1_1_200px] flex-col">
      <b :class="rowTitleClass">{{ summary?.title ?? BILLING_COPY.title }}</b>
      <span role="status" aria-live="polite" :class="rowHintClass">
        <template v-if="!ready || state === 'loading'">{{ BILLING_COPY.loading }}</template>
        <template v-else-if="state === 'failed'">{{ BILLING_COPY.loadFailed }}</template>
        <template v-else>{{ summary?.hint }}</template>
      </span>
      <span v-if="state === 'ready' && status && !status.canManage && status.subscription" :class="rowHintClass">
        {{ BILLING_COPY.signInToManage }}
      </span>
      <span v-if="portalError" role="alert" class="text-[13px] font-bold text-danger-text">{{ portalError }}</span>
    </span>
    <button v-if="state === 'failed'" type="button" :class="buttonClass" @click="load">{{ BILLING_COPY.retry }}</button>
    <button
      v-else-if="state === 'ready' && status?.canManage"
      type="button"
      :disabled="portalBusy"
      :class="buttonClass"
      @click="openPortal"
    >
      {{ portalBusy ? BILLING_COPY.opening : BILLING_COPY.manage }}
    </button>
    <NuxtLink v-else-if="state === 'ready' && !status?.access" to="/pricing" :class="buttonClass">
      {{ BILLING_COPY.seePlans }}
    </NuxtLink>
  </div>
</template>
