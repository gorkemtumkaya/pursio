<script setup lang="ts">
import { AUTH_MESSAGES } from '~/utils/auth-logic'

/**
 * Shows its slot only once a session exists (spec: accounts-cloud-save,
 * Req 3.4, 3.6). Until then it shows the loading state, or the "couldn't start
 * your account" message with "Try again" (Req 3.5, 3.7). Content inside it can
 * therefore rely on a user id and may send cloud requests.
 */
const { status, retry } = useAuth()
</script>

<template>
  <slot v-if="status === 'anonymous' || status === 'signed_in'" />
  <div v-else class="mx-auto w-full max-w-160">
    <AuthRetryNotice v-if="status === 'unavailable'" :message="AUTH_MESSAGES.unavailable" @retry="retry" />
    <PathStatus v-else state="loading" message="Loading…" />
  </div>
</template>
