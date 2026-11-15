<script setup lang="ts">
// The tab icon, home-screen icon and manifest follow the theme. The .ico fallback lives in nuxt.config.ts.
const { theme } = useTheme()
useHead({
  link: [
    { key: 'favicon-svg', rel: 'icon', type: 'image/svg+xml', href: () => THEME_FAVICONS[theme.value] },
    { key: 'apple-touch-icon', rel: 'apple-touch-icon', href: () => THEME_APP_ICONS[theme.value].appleTouchIcon },
    { key: 'manifest', rel: 'manifest', href: () => THEME_APP_ICONS[theme.value].manifest },
  ],
})
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
  <AppToast />
  <AuthDialog />
</template>
