import type { PricePreviewParams, PricePreviewResponse } from '@paddle/paddle-js'

/**
 * App-side sentinel for "country not known". It is never sent to Paddle: with
 * no address, Paddle.PricePreview() locates the visitor by IP.
 */
export const UNKNOWN_COUNTRY = 'OTHERS'

/** Request header that carries the visitor's country on Vercel. */
export const COUNTRY_HEADER = 'x-vercel-ip-country'

/**
 * The visitor's country from the CDN header: an ISO 3166-1 alpha-2 code, or
 * UNKNOWN_COUNTRY when the header is absent or not a real country (e.g. "XX").
 */
export function countryFromHeader(value: string | undefined): string {
  const code = (value ?? '').trim().toUpperCase()
  return /^[A-Z]{2}$/.test(code) && code !== 'XX' ? code : UNKNOWN_COUNTRY
}

/** PricePreview input. The address is left out entirely for an unknown country. */
export function pricePreviewParams(priceIds: readonly string[], country: string): PricePreviewParams {
  const items = priceIds.map((priceId) => ({ priceId, quantity: 1 }))
  return country === UNKNOWN_COUNTRY ? { items } : { items, address: { countryCode: country } }
}

/** Price ID to the total Paddle formatted for it, used as-is with no reformatting. */
export type FormattedPrices = Record<string, string>

export function formattedTotals(response: PricePreviewResponse): FormattedPrices {
  const out: FormattedPrices = {}
  for (const item of response.data.details.lineItems) out[item.price.id] = item.formattedTotals.total
  return out
}

/** Price ID to its trial length in days, from the catalog (e.g. 7). Prices without a day trial are left out. */
export function trialDays(response: PricePreviewResponse): Record<string, number> {
  const out: Record<string, number> = {}
  for (const item of response.data.details.lineItems) {
    const trial = item.price.trialPeriod
    if (trial && trial.interval === 'day') out[item.price.id] = trial.frequency
  }
  return out
}
