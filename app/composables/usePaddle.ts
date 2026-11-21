import { initializePaddle, type Paddle } from '@paddle/paddle-js'
import { readPaddleConfig } from '~/utils/paddle-config'

/** One Paddle.js instance per page load, shared by every caller. */
let loading: Promise<Paddle> | null = null

/**
 * Loads Paddle.js with the client-side token (client only). Throws with a
 * clear message when NUXT_PUBLIC_PADDLE_ENV or NUXT_PUBLIC_PADDLE_CLIENT_TOKEN
 * is missing or wrong; the environment is never defaulted.
 * Only the public client-side token is used here; no Paddle API key exists in app code.
 */
export function usePaddle() {
  const config = useRuntimeConfig().public

  function load(): Promise<Paddle> {
    if (!import.meta.client) return Promise.reject(new Error('Paddle.js runs in the browser only.'))
    loading ??= (async () => {
      const { environment, token } = readPaddleConfig(String(config.paddleEnv), String(config.paddleClientToken))
      const paddle = await initializePaddle({ environment, token })
      if (!paddle) throw new Error('Paddle.js did not load.')
      return paddle
    })().catch((error: unknown) => {
      loading = null
      console.error('[paddle]', error)
      throw error
    })
    return loading
  }

  return { load }
}
