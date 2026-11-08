# Tech

- Nuxt 4 + Vue 3 Composition API, always `<script setup lang="ts">`.
- TypeScript strict. No `any`: use `unknown` and narrow, or add types in `shared/types/`.
- TypeScript stays on 6.x until vue-tsc supports TypeScript 7.
- Package manager: yarn. Commands: `yarn dev`, `yarn build`, `yarn typecheck`.
- Styling: Tailwind CSS v4 via `@tailwindcss/vite`. No component library.
- Theme tokens are CSS variables (`--pursio-*`) for trail, boulder and halloween in `app/assets/css/themes.css`, mapped to Tailwind in `@theme inline` in `app/assets/css/main.css`. Tailwind's default palette is removed.
- Use token utilities (`bg-surface`, `text-ink`, `rounded-node`, `shadow-raised-primary`, `font-display`). Never hardcode colors, fonts, radii or shadows in components. Text on `bg`/`surface` uses `ink`, `muted` or `accent-text`, not `primary`.
- Switching theme only changes `data-theme` on `<html>`, never markup. Read and set it with `useTheme()`. Reference page: `/dev/theme` (dev only).
- Fonts load from Google Fonts via `<link>` in `nuxt.config.ts`.
- Small, focused components with typed props and emits.
- No new dependencies without asking first. Pin exact versions.
- Backend (later): Supabase Auth, Postgres with RLS, Edge Functions, pgvector.
- Secrets only in `.env`, never committed. Add new keys to `.env.example` with placeholder values.
