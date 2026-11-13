<script setup lang="ts">
/** The "Delete your account?" confirmation, driven by `useAccountActions` (spec: accounts-cloud-save, Req 11.7). */
defineProps<{ open: boolean; busy: boolean; error: string | null }>()
const emit = defineEmits<{ confirm: []; cancel: [] }>()
</script>

<template>
  <PathConfirmDialog
    :open="open"
    title="Delete your account?"
    message="All your paths, your progress and your profile are deleted for good. This cannot be undone."
    confirm-label="Delete my account"
    tone="danger"
    :busy="busy"
    :error="error"
    @confirm="emit('confirm')"
    @cancel="emit('cancel')"
  />
</template>
