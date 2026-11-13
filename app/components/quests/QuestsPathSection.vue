<script setup lang="ts">
import type { PathCard } from '~/utils/quests-view'

/** "From your path" heading with its cards. Renders nothing without cards (Req 11.6). */
defineProps<{ cards: readonly PathCard[]; to: string }>()
</script>

<template>
  <section v-if="cards.length > 0" aria-labelledby="quests-path-heading">
    <h2 id="quests-path-heading" class="font-head text-xl font-semibold text-ink">From your path</h2>
    <ul class="mt-3 grid list-none gap-3 p-0 lg:grid-cols-2">
      <li v-for="card in cards" :key="card.node.id">
        <QuestsPathCard :card="card" :to="to" />
      </li>
    </ul>
  </section>
</template>
