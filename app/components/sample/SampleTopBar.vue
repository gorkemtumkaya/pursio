<script setup lang="ts">
import { SAMPLE_COPY } from '~/utils/sample-copy'

/**
 * Top bar of the sample page (spec: sample-path, Req 4.1 to 4.3). The logo and "Log in" are plain
 * links: pressing them starts nothing on this page (Req 3.6). "Build my own path" is desktop only
 * and asks the page to focus the note box.
 */
const emit = defineEmits<{ buildOwn: [] }>()
</script>

<template>
  <header class="border-b-2 border-line">
    <!-- Same logo markup as the new hobby page's header. -->
    <div class="mx-auto flex w-full max-w-[1048px] items-center justify-between gap-3 px-4 py-4 max-[700px]:py-3">
      <div class="flex min-w-0 items-center gap-3">
        <NuxtLink
          to="/"
          class="flex cursor-pointer items-center gap-2.5 rounded-[14px] font-head text-[26px] font-bold text-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary max-[700px]:text-[21px]"
        >
          <span aria-hidden="true" class="size-9 shrink-0 bg-(image:--pursio-logo) bg-contain bg-center bg-no-repeat" />
          <span>Pursio</span>
        </NuxtLink>
        <span class="shrink-0 rounded-lg border-2 border-dashed border-primary px-2 py-0.5 text-xs font-extrabold tracking-[0.06em] text-accent-text">
          {{ SAMPLE_COPY.tag }}
        </span>
      </div>

      <div class="hidden items-center gap-2 lg:flex">
        <NuxtLink
          to="/path"
          class="flex h-11 cursor-pointer items-center rounded-[14px] px-3 text-[15px] font-extrabold text-accent-text hover:bg-surface-2 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {{ SAMPLE_COPY.logIn }}
        </NuxtLink>
        <AppButton size="md" class="cursor-pointer" @click="emit('buildOwn')">{{ SAMPLE_COPY.buildOwn }}</AppButton>
      </div>
    </div>
  </header>
</template>
