// Paddle catalog IDs the app and the server both need. Sandbox and live are
// separate accounts with separate IDs, so each environment has its own.

export type PaddleEnvironment = 'sandbox' | 'production'

/**
 * The one-time Founding member price per environment ($19.99).
 * Sandbox product pro_01m7z53bqpv547tfxdvnfhj9e4, live product pro_01m7z648hw83fz0s35fp05qr8j.
 */
export const FOUNDING_PRICE_ID: Record<PaddleEnvironment, string> = {
  sandbox: 'pri_01m7z53bx7exmc85qm2cfkssbt',
  production: 'pri_01m7z648r3tja83w8z89kry3bx',
}

/** Founding membership is sold to the first 50 buyers. A refunded membership frees its spot. */
export const FOUNDING_LIMIT = 50

/** Whether a price ID is the founding price of the given environment. */
export function isFoundingPrice(priceId: string | null | undefined, environment: PaddleEnvironment): boolean {
  return typeof priceId === 'string' && priceId === FOUNDING_PRICE_ID[environment]
}
