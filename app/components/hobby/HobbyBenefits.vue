<script setup lang="ts">
const cardClass = 'flex flex-col gap-2 rounded-3xl border-2 border-line bg-surface px-5 py-4.5'
const titleClass = 'font-head text-[19px] font-semibold text-ink'
const textClass = 'text-sm leading-[1.45] text-muted'
</script>

<template>
  <section class="hidden w-full flex-col gap-3.5 min-[701px]:flex" aria-labelledby="get-title">
    <h2 id="get-title" class="text-center text-[13px] font-extrabold uppercase tracking-[0.06em] text-muted">
      What you’ll get
    </h2>

    <div class="grid grid-cols-[repeat(auto-fit,minmax(15rem,1fr))] gap-4">
      <div :class="cardClass">
        <div class="flex items-center gap-1.5" aria-hidden="true">
          <span class="size-6.5 rounded-full bg-done" />
          <span class="h-1 w-4 rounded-full bg-line" />
          <span class="size-6.5 rounded-full bg-primary" />
          <span class="h-1 w-4 rounded-full bg-line" />
          <span class="size-6.5 rounded-full bg-locked" />
        </div>
        <h3 :class="titleClass">A skill path</h3>
        <p :class="textClass">Around 15 skills in 3 sections, in the order people really learn them.</p>
      </div>

      <div :class="cardClass">
        <span class="grid size-7 place-items-center rounded-lg bg-done text-done-ink" aria-hidden="true">
          <PathIcon name="check" class="size-4" />
        </span>
        <h3 :class="titleClass">Small daily quests</h3>
        <p :class="textClass">Three concrete things to try for every skill, so you always know what to do next.</p>
      </div>

      <div :class="cardClass">
        <span class="grid size-7 place-items-center rounded-lg bg-primary text-primary-ink" aria-hidden="true">
          <PathIcon name="play" class="size-3.5" />
        </span>
        <h3 :class="titleClass">Fresh content</h3>
        <p :class="textClass">New videos and articles matched to the skill you’re on, every day.</p>
      </div>
    </div>
  </section>
</template>
