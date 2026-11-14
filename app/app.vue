<script setup lang="ts">
// The SVG tab icon follows the theme. The .ico fallback lives in nuxt.config.ts.
const { theme } = useTheme()
useHead({
  link: [{ key: 'favicon-svg', rel: 'icon', type: 'image/svg+xml', href: () => THEME_FAVICONS[theme.value] }],
})
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
  <AppToast />
  <AuthDialog />
</template>
