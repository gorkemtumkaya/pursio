import tailwindcss from '@tailwindcss/vite'
import { THEME_STORAGE_KEY, THEMES } from './shared/utils/theme'

const googleFontsUrl =
  'https://fonts.googleapis.com/css2'
  + '?family=Archivo:wght@400;600;800'
  + '&family=Archivo+Black'
  + '&family=Creepster'
  + '&family=Fredoka:wght@500;600;700'
  + '&family=Nunito+Sans:wght@400;600;700;800'
  + '&display=swap'

// Runs in <head> before first paint so a saved theme never flashes the default.
const themeInitScript = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(${JSON.stringify(THEMES)}.indexOf(t)>-1)document.documentElement.setAttribute('data-theme',t)}catch(e){}})()`

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-11-08',
  devtools: { enabled: true },
  css: ['~/assets/css/main.css'],
  typescript: {
    strict: true,
  },
  vite: {
    plugins: [tailwindcss()],
  },
  app: {
    head: {
      // data-theme is managed by useTheme(); no attribute means "trail".
      htmlAttrs: { lang: 'en' },
      title: 'Pursio',
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        { rel: 'stylesheet', href: googleFontsUrl },
      ],
      script: [{ innerHTML: themeInitScript, tagPosition: 'head' }],
    },
  },
  runtimeConfig: {
    // Server-only values come from .env (NUXT_*)
    public: {
      supabaseUrl: '',
      supabaseAnonKey: '',
    },
  },
})
