import tailwindcss from '@tailwindcss/vite'
import { pathHintInitScript } from './shared/utils/path-hint'
import { SAMPLE_SLUGS } from './shared/utils/sample-slugs'
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

if (process.env.NODE_ENV !== 'production') {
  for (const variable of ['NUXT_PUBLIC_POSTHOG_KEY', 'NUXT_PUBLIC_POSTHOG_HOST']) {
    if (!process.env[variable]) {
      console.warn(`${variable} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${variable} is configured`)
    }
  }
}

for (const variable of ['NUXT_PUBLIC_PADDLE_ENV', 'NUXT_PUBLIC_PADDLE_CLIENT_TOKEN']) {
  if (!process.env[variable]) {
    console.warn(`${variable} is unset: /pricing cannot load prices or open Paddle Checkout until it is set.`)
  }
}

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
    // Dev server only: lets an ngrok tunnel reach `yarn dev`, so Paddle can deliver
    // sandbox webhooks to POST /api/paddle/webhook locally. Ignored by production builds.
    server: { allowedHosts: ['.ngrok-free.dev', '.ngrok-free.app'] },
  },
  app: {
    head: {
      // data-theme is managed by useTheme(); no attribute means "boulder" (DEFAULT_THEME).
      htmlAttrs: { lang: 'en' },
      title: 'Pursio',
      meta: [{ name: 'theme-color', content: '#2A231E' }],
      link: [
        { rel: 'icon', href: '/favicon.ico?v=2', sizes: '32x32' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        { rel: 'stylesheet', href: googleFontsUrl },
      ],
      script: [
        { innerHTML: themeInitScript, tagPosition: 'head' },
        // Landing spec Req 1.5, 1.7: marks <html data-path-hint> before first paint
        // when this device has a Path_Hint, so `/` opens on the loader.
        { innerHTML: pathHintInitScript, tagPosition: 'head' },
      ],
    },
  },
  runtimeConfig: {
    // Server-only values come from .env (NUXT_*)
    llmProvider: '',
    llmModel: '',
    llmApiKey: '',
    // Small_Model of POST /api/intake per provider (spec: path-intake, decisions 32 and 37).
    // Keep a Haiku model for Anthropic: the call turns thinking off and forces a tool call,
    // which some larger Claude models reject.
    llmIntakeModelAnthropic: 'claude-haiku-5-5',
    llmIntakeModelOpenai: 'gpt-5-mini',
    // Lowest reasoning effort of the OpenAI intake model; used only with a learner's own key.
    llmIntakeReasoningEffortOpenai: 'minimal',
    // Read by server/utils/account-runtime.ts (DELETE /api/account) and
    // server/utils/video/runtime.ts (video pipeline tables).
    supabaseServiceRoleKey: '',
    // Video pipeline (server-only, never under public).
    youtubeApiKey: '',
    // Daily provider quota units per Pacific day.
    videoDailyQuota: 10000,
    // Secret for POST /api/videos/drain (header x-video-drain-secret).
    videoDrainSecret: '',
    // Secret for POST /api/fresh/check (header x-fresh-check-secret). Server-only.
    freshCheckSecret: '',
    // Paddle billing (server-only, never under public). NUXT_PADDLE_API_KEY is a
    // pdl_sdbx_apikey_/pdl_live_apikey_ key for the portal and customer lookups;
    // NUXT_PADDLE_WEBHOOK_SECRET is the notification destination's signing secret
    // (pdl_ntfset_...), a different value. Read by server/utils/billing-runtime.ts.
    paddleApiKey: '',
    paddleWebhookSecret: '',
    public: {
      supabaseUrl: '',
      supabaseAnonKey: '',
      posthogKey: '',
      posthogHost: '',
      // Paddle.js on /pricing. No default: usePaddle() throws when either is unset.
      // NUXT_PUBLIC_PADDLE_ENV is "sandbox" or "production"; the client-side token
      // NUXT_PUBLIC_PADDLE_CLIENT_TOKEN starts with test_ or live_ to match it.
      paddleEnv: '',
      paddleClientToken: '',
      // NUXT_PUBLIC_PADDLE_CHECKOUT_ENABLED=true lets Subscribe open Paddle Checkout.
      // Off by default: /pricing still shows Paddle's prices, with "Coming soon"
      // instead of Subscribe (e.g. while Paddle reviews the live account).
      paddleCheckoutEnabled: false,
    },
  },
  // The sample path pages are static files made at build time (spec: sample-path, Req 1.6). Any other
  // /try/<slug> reaches the server, which answers 302 to /new.
  routeRules: Object.fromEntries(SAMPLE_SLUGS.map((slug) => [`/try/${slug}`, { prerender: true }])),
  nitro: {
    // Hosted on Vercel; supabase is only the database, Auth and pg_cron + pg_net.
    preset: 'vercel',
    // Every function, /api/fresh/check included (fresh design.md, Serverless timing):
    // the Check_Route's Call_Deadline is 117 s after the call starts.
    vercel: { functions: { maxDuration: 120 } },
    // Relative to server/; read with useStorage('assets:prompts').
    serverAssets: [{ baseName: 'prompts', dir: './prompts' }],
  },
})
