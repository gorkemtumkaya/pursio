import type { PricePreviewResponse } from '@paddle/paddle-js'
import { describe, expect, it } from 'vitest'
import { checkoutEnabled, readPaddleConfig } from '~/utils/paddle-config'
import {
  countryFromHeader,
  formattedTotals,
  pricePreviewParams,
  trialDays,
  UNKNOWN_COUNTRY,
} from '~/utils/paddle-pricing'
import { FOUNDING_PRICE_ID, paidPriceIds, PRICE_IDS, tiersFor, type Tier } from '~/utils/pricing-tiers'

describe('readPaddleConfig', () => {
  it('accepts a sandbox env with a test_ token', () => {
    expect(readPaddleConfig('sandbox', 'test_abc')).toEqual({ environment: 'sandbox', token: 'test_abc' })
    expect(readPaddleConfig('production', 'live_abc')).toEqual({ environment: 'production', token: 'live_abc' })
  })

  it('fails loudly when the environment is unset or unknown, never defaulting', () => {
    expect(() => readPaddleConfig('', 'test_abc')).toThrow(/NUXT_PUBLIC_PADDLE_ENV.*unset/)
    expect(() => readPaddleConfig('staging', 'test_abc')).toThrow(/NUXT_PUBLIC_PADDLE_ENV/)
  })

  it('fails when the token is unset or belongs to the other environment, without printing it', () => {
    expect(() => readPaddleConfig('sandbox', '')).toThrow(/NUXT_PUBLIC_PADDLE_CLIENT_TOKEN is unset/)
    expect(() => readPaddleConfig('sandbox', 'live_secretish')).toThrow(/starts with "test_"/)
    expect(() => readPaddleConfig('production', 'test_x')).toThrow(/starts with "live_"/)
    try {
      readPaddleConfig('sandbox', 'live_secretish')
    } catch (error) {
      expect(String(error)).not.toContain('secretish')
    }
  })
})

describe('checkout switch', () => {
  it('is on only for an explicit true', () => {
    expect(checkoutEnabled(true)).toBe(true)
    expect(checkoutEnabled('true')).toBe(true)
    for (const value of [false, 'false', '', undefined, null, 1, 'yes', 'TRUE']) expect(checkoutEnabled(value)).toBe(false)
  })
})

describe('country detection', () => {
  it('normalises a header country code', () => {
    expect(countryFromHeader('de')).toBe('DE')
    expect(countryFromHeader(' US ')).toBe('US')
  })

  it('returns the app-side sentinel for a missing or unusable header', () => {
    for (const value of [undefined, '', 'XX', 'USA', '1A', 'T1']) expect(countryFromHeader(value)).toBe(UNKNOWN_COUNTRY)
  })

  it('never sends the sentinel to Paddle: no address at all lets Paddle use the IP', () => {
    const params = pricePreviewParams(['pri_a'], UNKNOWN_COUNTRY)
    expect(params).toEqual({ items: [{ priceId: 'pri_a', quantity: 1 }] })
    expect('address' in params).toBe(false)
    expect(pricePreviewParams(['pri_a'], 'JP').address).toEqual({ countryCode: 'JP' })
  })
})

describe('tiers', () => {
  it('previews both prices of every paid tier in one call', () => {
    const tiers: Tier[] = [
      { name: 'Free', description: '', features: [], priceId: null, featured: false },
      { name: 'Plus', description: '', features: [], priceId: { month: 'pri_m', year: 'pri_y' }, featured: true },
    ]
    expect(paidPriceIds(tiers)).toEqual(['pri_m', 'pri_y'])
  })

  it('uses Paddle price IDs for every paid tier', () => {
    for (const env of ['sandbox', 'production'] as const) {
      const ids = paidPriceIds(tiersFor(env))
      expect(ids).toEqual([PRICE_IDS[env].plus.month, PRICE_IDS[env].plus.year])
      for (const id of [...ids, FOUNDING_PRICE_ID[env]]) expect(id).toMatch(/^pri_[a-z\d]{26}$/)
    }
  })

  it('never shares a price ID between sandbox and live', () => {
    const sandbox = [...paidPriceIds(tiersFor('sandbox')), FOUNDING_PRICE_ID.sandbox]
    const live = [...paidPriceIds(tiersFor('production')), FOUNDING_PRICE_ID.production]
    expect(new Set([...sandbox, ...live]).size).toBe(6)
  })
})

describe('PricePreview response', () => {
  const response = {
    data: {
      details: {
        lineItems: [
          { price: { id: 'pri_m', trialPeriod: { interval: 'day', frequency: 7 } }, formattedTotals: { total: '¥790' } },
          { price: { id: 'pri_y', trialPeriod: null }, formattedTotals: { total: '€35,69' } },
        ],
      },
    },
  } as unknown as PricePreviewResponse

  it('keeps Paddle formatted totals exactly as returned', () => {
    expect(formattedTotals(response)).toEqual({ pri_m: '¥790', pri_y: '€35,69' })
  })

  it('reads day trials from the catalog', () => {
    expect(trialDays(response)).toEqual({ pri_m: 7 })
  })
})
