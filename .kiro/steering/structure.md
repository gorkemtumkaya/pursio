# Structure

Nuxt 4 layout: app code lives in `app/` (the `~` alias points there).

```
app/app.vue                 Root: NuxtLayout + NuxtPage
app/assets/css/main.css     Tailwind import + @theme mapping of tokens
app/assets/css/themes.css   Token values for every theme, keyed by [data-theme]
app/components/             Small focused Vue components (auto-imported)
app/components/dev/         Dev-only tools (DevThemeSwitcher, DevSwatch)
app/composables/            useX() composables (auto-imported), e.g. useTheme
app/layouts/default.vue     Default layout
app/pages/                  File-based routes (index.vue = landing)
app/pages/dev/              Dev-only pages (404 in production)
app/plugins/                Nuxt plugins (theme.client.ts syncs saved theme)
app/utils/                  Pure helpers (auto-imported)
shared/types/               Types shared by app and server (Theme)
shared/utils/               Helpers shared by app and server (THEMES, isTheme)
server/                     Nitro server routes (later)
public/                     Static assets served as-is
nuxt.config.ts              Nuxt config (Tailwind vite plugin, runtimeConfig)
tsconfig.json               References the generated .nuxt/tsconfig.*.json
docs/PROJECT.md             Full project description
dev_docs/                   Design mockups (reference only)
.kiro/steering/             Kiro steering docs
```

New theme: add a `[data-theme="<name>"]` block to `themes.css` defining every `--pursio-*` variable, and add the name to `Theme` and `THEMES`.
New token: add it to every theme block, map it in `main.css`, and add a swatch on `/dev/theme`.
