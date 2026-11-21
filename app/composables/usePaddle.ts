import { initializePaddle, type Paddle } from '@paddle/paddle-js'
import { readPaddleConfig } from '~/utils/paddle-config'

/** One Paddle.js instance per page load, shared by every caller. */
let loading: Promise<Paddle> | null = null
let instance: Paddle | null = null

/**
 * Loads Paddle.js with the client-side token (client only). Throws with a
 * clear message when NUXT_PUBLIC_PADDLE_ENV or NUXT_PUBLIC_PADDLE_CLIENT_TOKEN
 * is missing or wrong; the environment is never defaulted.
 * Only the public client-side token is used here; no Paddle API key exists in app code.
 *
 * Paddle Retain: when the signed-in account's Paddle customer id (`ctm_…`) is
 * known, it is passed as `pwCustomer` to Initialize, or with Update when it
 * arrives after Paddle.js has loaded. It is always the Paddle customer id from
 * the server, never the Pursio user id or the email.
 */
export function usePaddle() {
  const config = useRuntimeConfig().public
  const customerId = useState<string | null>('paddle-customer-id', () => null)

  function load(): Promise<Paddle> {
    if (!import.meta.client) return Promise.reject(new Error('Paddle.js runs in the browser only.'))
    loading ??= (async () => {
      const { environment, token } = readPaddleConfig(String(config.paddleEnv), String(config.paddleClientToken))
      const id = customerId.value
      const paddle = await initializePaddle({ environment, token, ...(id ? { pwCustomer: { id } } : {}) })
      if (!paddle) throw new Error('Paddle.js did not load.')
      instance = paddle
      return paddle
    })().catch((error: unknown) => {
      loading = null
      console.error('[paddle]', error)
      throw error
    })
    return loading
  }

  /** Sets the Retain customer. Paddle.js already loaded gets it through Update. */
  function setCustomer(id: string | null): void {
    if (customerId.value === id) return
    customerId.value = id
    if (instance && id) instance.Update({ pwCustomer: { id } })
  }

  return { load, setCustomer }
}
