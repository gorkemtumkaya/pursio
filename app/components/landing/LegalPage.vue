<script setup lang="ts">
import { LANDING_COPY } from '~/utils/landing-copy'
import { LEGAL_UPDATED, type LegalDocument } from '~/utils/legal-copy'

/** A legal page with the landing header and footer (spec: landing-page, Req 10). The text is in `legal-copy.ts`. */
const props = defineProps<{ document: LegalDocument }>()
useHead({ title: () => `${props.document.title} · ${LANDING_COPY.brandName}` })
</script>

<template>
  <div class="flex min-h-dvh flex-col overflow-x-clip bg-bg">
    <LandingHeader />
    <main class="mx-auto w-full max-w-[820px] flex-1 px-4 py-7 min-[700px]:px-8 min-[700px]:py-12">
      <h1 class="font-display text-4xl leading-[1.05] font-semibold text-ink min-[700px]:text-[58px]">
        {{ document.title }}
      </h1>
      <p class="mt-3 text-sm font-bold text-muted">{{ LEGAL_UPDATED }}</p>
      <p class="mt-5 text-base leading-[1.55] text-ink min-[700px]:text-[19px]">{{ document.intro }}</p>

      <section v-for="section in document.sections" :key="section.heading" class="mt-9">
        <h2 class="font-head text-[21px] leading-tight font-semibold text-ink">{{ section.heading }}</h2>
        <p v-for="text in section.paragraphs" :key="text" class="mt-3 text-base leading-[1.55] text-muted">
          {{ text }}
        </p>
        <ul v-if="section.items" class="mt-3 flex list-disc flex-col gap-2 pl-5 text-base leading-[1.55] text-muted">
          <li v-for="item in section.items" :key="item">{{ item }}</li>
        </ul>
      </section>

      <NuxtLink
        to="/"
        class="mt-10 inline-flex min-h-11 items-center rounded-lg text-[15px] font-extrabold text-accent-text underline underline-offset-2 hover:text-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        {{ LANDING_COPY.backToPursio }}
      </NuxtLink>
    </main>
    <LandingFooter />
  </div>
</template>
