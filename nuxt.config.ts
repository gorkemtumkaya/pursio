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
      // data-theme is managed by useTheme(); no attribute means "boulder" (DEFAULT_THEME).
      htmlAttrs: { lang: 'en' },
      title: 'Pursio',
      meta: [{ name: 'theme-color', content: '#2A231E' }],
      link: [
        { rel: 'icon', href: '/favicon.ico', sizes: '32x32' },
        { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
        { rel: 'manifest', href: '/site.webmanifest' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        { rel: 'stylesheet', href: googleFontsUrl },
      ],
      script: [{ innerHTML: themeInitScript, tagPosition: 'head' }],
    },
  },
  runtimeConfig: {
    // Server-only values come from .env (NUXT_*)
    llmProvider: '',
    llmModel: '',
    llmApiKey: '',
    // Read by server/utils/account-runtime.ts (DELETE /api/account) and
    // server/utils/video/runtime.ts (video pipeline tables).
    supabaseServiceRoleKey: '',
    // Video pipeline (server-only, never under public).
    youtubeApiKey: '',
    // Daily provider quota units per Pacific day.
    videoDailyQuota: 10000,
    // Secret for POST /api/videos/drain (header x-video-drain-secret).
    videoDrainSecret: '',
    public: {
      supabaseUrl: '',
      supabaseAnonKey: '',
    },
  },
  nitro: {
    // Hosted on Vercel; supabase is only the database, Auth and pg_cron + pg_net.
    preset: 'vercel',
    // Video pipeline runs fit in 60 s (see design.md, Serverless execution).
    vercel: { functions: { maxDuration: 60 } },
    // Relative to server/; read with useStorage('assets:prompts').
    serverAssets: [{ baseName: 'prompts', dir: './prompts' }],
  },
})
