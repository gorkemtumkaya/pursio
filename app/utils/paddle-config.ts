import type { Environments } from '@paddle/paddle-js'

/** Paddle.js settings read from NUXT_PUBLIC_PADDLE_ENV and NUXT_PUBLIC_PADDLE_CLIENT_TOKEN. */
export interface PaddleConfig {
  environment: Environments
  token: string
}

/**
 * Whether Subscribe may open Paddle Checkout (NUXT_PUBLIC_PADDLE_CHECKOUT_ENABLED).
 * Only an explicit true turns it on; unset, "false" or anything else keeps it off.
 */
export function checkoutEnabled(value: unknown): boolean {
  return value === true || value === 'true'
}

/** A client-side token belongs to one environment, shown by its prefix. */
const TOKEN_PREFIX: Record<Environments, string> = { sandbox: 'test_', production: 'live_' }

function isEnvironment(value: string): value is Environments {
  return value === 'sandbox' || value === 'production'
}

/**
 * Checks the Paddle runtime config and throws if it is missing or inconsistent.
 * There is no default environment, so the app never runs against the wrong
 * Paddle account by accident. Error messages name the variables, never the token value.
 */
export function readPaddleConfig(environment: string, token: string): PaddleConfig {
  const env = environment.trim()
  if (!isEnvironment(env)) {
    const got = env === '' ? 'it is unset' : `got "${env}"`
    throw new Error(`NUXT_PUBLIC_PADDLE_ENV must be "sandbox" or "production"; ${got}.`)
  }
  const value = token.trim()
  if (value === '') throw new Error('NUXT_PUBLIC_PADDLE_CLIENT_TOKEN is unset.')
  const prefix = TOKEN_PREFIX[env]
  if (!value.startsWith(prefix)) {
    throw new Error(
      `NUXT_PUBLIC_PADDLE_CLIENT_TOKEN does not match NUXT_PUBLIC_PADDLE_ENV=${env}: a ${env} client-side token starts with "${prefix}".`,
    )
  }
  return { environment: env, token: value }
}
