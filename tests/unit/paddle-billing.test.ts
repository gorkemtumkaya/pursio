import { createHmac } from 'node:crypto'
import { Environment, LogLevel, Paddle } from '@paddle/paddle-node-sdk'
import { describe, expect, it, vi } from 'vitest'
import type { MirroredSubscription } from '~~/shared/types/billing'
import { currentSubscription, grantsPaidAccess } from '~~/shared/utils/billing-access'
import {
  customDataUserId,
  handleBillingPortal,
  handleBillingStatus,
  handlePaddleWebhook,
  type AccountBillingDeps,
  type BillingStore,
  type CustomerRow,
  type SubscriptionRow,
  type TransactionRow,
  type UpsertResult,
  type WebhookDeps,
} from '~~/server/utils/billing-handlers'
import { paddleServerEnvironment } from '~~/server/utils/billing-runtime'
import { createPaddleIpList, ipInCidrs, paddleIpsUrl, parseIpsResponse, sourceIp } from '~~/server/utils/paddle-ips'

const PADDLE_IP = '34.237.3.244'

const SECRET = 'pdl_ntfset_test_secret_for_unit_tests'
const USER_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7'
const paddle = new Paddle('pdl_sdbx_apikey_unit', { environment: Environment.sandbox, logLevel: LogLevel.none })

/** Signs a body the way Paddle does: `ts=<unix>;h1=<hmac-sha256(ts:body)>`. */
function sign(body: string, secret = SECRET, ts = Math.floor(Date.now() / 1000)): string {
  return `ts=${ts};h1=${createHmac('sha256', secret).update(`${ts}:${body}`).digest('hex')}`
}

function price(id: string) {
  return {
    id,
    product_id: 'pro_01m7yxc6q85jyxdnpnbd2k1wc9',
    description: 'Premium monthly USD',
    name: 'Monthly',
    type: 'standard',
    billing_cycle: { interval: 'month', frequency: 1 },
    trial_period: { interval: 'day', frequency: 7 },
    tax_mode: 'account_setting',
    unit_price: { amount: '499', currency_code: 'USD' },
    unit_price_overrides: [],
    quantity: { minimum: 1, maximum: 100 },
    status: 'active',
    custom_data: null,
    import_meta: null,
    created_at: '2026-11-21T10:00:00Z',
    updated_at: '2026-11-21T10:00:00Z',
  }
}

function subscriptionEvent(opts: {
  type?: string
  eventId?: string
  status?: string
  updatedAt?: string
  scheduledChange?: { action: string; effective_at: string; resume_at: null } | null
  customData?: Record<string, unknown> | null
}): string {
  return JSON.stringify({
    event_id: opts.eventId ?? 'evt_01sub',
    event_type: opts.type ?? 'subscription.created',
    occurred_at: opts.updatedAt ?? '2026-11-21T12:00:00Z',
    notification_id: 'ntf_01',
    data: {
      id: 'sub_01m7z0f0kkzj3w4sdt1c6k36sr',
      status: opts.status ?? 'trialing',
      customer_id: 'ctm_01test',
      address_id: 'add_01test',
      business_id: null,
      currency_code: 'USD',
      created_at: '2026-11-21T12:00:00Z',
      updated_at: opts.updatedAt ?? '2026-11-21T12:00:00Z',
      started_at: '2026-11-21T12:00:00Z',
      first_billed_at: null,
      next_billed_at: '2026-11-28T12:00:00Z',
      paused_at: null,
      canceled_at: null,
      discount: null,
      collection_mode: 'automatic',
      billing_details: null,
      current_billing_period: { starts_at: '2026-11-21T12:00:00Z', ends_at: '2026-11-28T12:00:00Z' },
      billing_cycle: { interval: 'month', frequency: 1 },
      scheduled_change: opts.scheduledChange ?? null,
      items: [
        {
          status: 'trialing',
          quantity: 1,
          recurring: true,
          created_at: '2026-11-21T12:00:00Z',
          updated_at: '2026-11-21T12:00:00Z',
          previously_billed_at: null,
          next_billed_at: '2026-11-28T12:00:00Z',
          trial_dates: { starts_at: '2026-11-21T12:00:00Z', ends_at: '2026-11-28T12:00:00Z' },
          price: price('pri_01m7yxc793p1af7c9vnmqcmw3n'),
          product: null,
        },
      ],
      custom_data: opts.customData === undefined ? { pursioUserId: USER_ID } : opts.customData,
      import_meta: null,
    },
  })
}

function customerEvent(email: string, updatedAt = '2026-11-21T12:00:00Z'): string {
  return JSON.stringify({
    event_id: 'evt_01ctm',
    event_type: 'customer.created',
    occurred_at: updatedAt,
    notification_id: 'ntf_02',
    data: {
      id: 'ctm_01test',
      name: null,
      email,
      marketing_consent: false,
      status: 'active',
      custom_data: null,
      locale: 'en',
      created_at: '2026-11-21T12:00:00Z',
      updated_at: updatedAt,
      import_meta: null,
    },
  })
}

/** In-memory mirror with the SQL functions' rules: forward-only upserts and a customer foreign key. */
function memoryStore() {
  const customers = new Map<string, CustomerRow>()
  const subscriptions = new Map<string, SubscriptionRow>()
  const transactions = new Map<string, TransactionRow>()
  function forward<R extends { paddleUpdatedAt: string }>(map: Map<string, R>, key: string, row: R, merge?: (old: R) => R): UpsertResult {
    const old = map.get(key)
    if (old && Date.parse(old.paddleUpdatedAt) > Date.parse(row.paddleUpdatedAt)) return 'stale'
    map.set(key, old && merge ? merge(old) : row)
    return 'written'
  }
  const store: BillingStore = {
    upsertCustomer: async (row) => forward(customers, row.customerId, row),
    upsertSubscription: async (row) =>
      customers.has(row.customerId)
        ? forward(subscriptions, row.subscriptionId, row, (old) => ({ ...row, userId: row.userId ?? old.userId }))
        : 'missing_customer',
    upsertTransaction: async (row) =>
      row.customerId !== null && !customers.has(row.customerId) ? 'missing_customer' : forward(transactions, row.transactionId, row),
    customerIdByEmail: async (email) => [...customers.values()].find((c) => c.email === email)?.customerId ?? null,
    subscriptionsFor: async ({ userId, customerId }) =>
      [...subscriptions.values()]
        .filter((s) => s.userId === userId || (customerId !== null && s.customerId === customerId))
        .map(
          (s): MirroredSubscription => ({
            subscriptionId: s.subscriptionId,
            customerId: s.customerId,
            status: s.status,
            priceId: s.priceId,
            productId: s.productId,
            scheduledChangeAction: s.scheduledChangeAction,
            scheduledChangeAt: s.scheduledChangeAt,
            nextBilledAt: s.nextBilledAt,
            paddleUpdatedAt: s.paddleUpdatedAt,
          }),
        ),
  }
  return { store, customers, subscriptions, transactions }
}

function webhookDeps(store: BillingStore, overrides: Partial<WebhookDeps> = {}): WebhookDeps {
  return {
    secret: SECRET,
    allowedCidrs: async () => [`${PADDLE_IP}/32`, '34.195.105.136/32'],
    ipAllowed: ipInCidrs,
    unmarshal: (body, secret, signature) => paddle.webhooks.unmarshal(body, secret, signature),
    store,
    fetchCustomer: vi.fn(async (id: string) => ({ customerId: id, email: 'buyer@example.com', paddleUpdatedAt: '2026-11-21T11:59:00Z' })),
    ...overrides,
  }
}

async function deliver(body: string, deps: WebhookDeps, signature = sign(body), ip: string | null = PADDLE_IP) {
  return handlePaddleWebhook({ rawBody: body, signature, sourceIp: ip }, deps)
}

describe('webhook signature verification', () => {
  it('accepts a correctly signed raw body', async () => {
    const mem = memoryStore()
    const result = await deliver(customerEvent('Buyer@Example.com'), webhookDeps(mem.store))
    expect(result).toEqual({ status: 200, body: { received: true } })
    expect(mem.customers.get('ctm_01test')?.email).toBe('buyer@example.com')
  })

  it('never answers 2xx when the signature does not verify', async () => {
    const mem = memoryStore()
    const body = customerEvent('a@example.com')
    for (const signature of [sign(body, 'wrong_secret'), sign(`${body} `), 'ts=1;h1=deadbeef', sign(body, SECRET, 1)]) {
      const result = await deliver(body, webhookDeps(mem.store), signature)
      expect(result.status).toBeGreaterThanOrEqual(400)
    }
    expect(mem.customers.size).toBe(0)
  })

  it('fails a body that was parsed and re-serialized before verification', async () => {
    const mem = memoryStore()
    const body = JSON.stringify(JSON.parse(customerEvent('a@example.com')), null, 2)
    const result = await deliver(body, webhookDeps(mem.store), sign(customerEvent('a@example.com')))
    expect(result.status).toBe(401)
  })

  it('rejects a missing signature or body with 400, and a missing secret with 500', async () => {
    const mem = memoryStore()
    expect((await handlePaddleWebhook({ rawBody: 'x', signature: undefined, sourceIp: PADDLE_IP }, webhookDeps(mem.store))).status).toBe(400)
    expect((await handlePaddleWebhook({ rawBody: '', signature: 'ts=1;h1=a', sourceIp: PADDLE_IP }, webhookDeps(mem.store))).status).toBe(400)
    const body = customerEvent('a@example.com')
    expect((await deliver(body, webhookDeps(mem.store, { secret: '' }))).status).toBe(500)
  })
})

describe('webhook source allowlist', () => {
  it('rejects a correctly signed delivery from an address Paddle does not list', async () => {
    const mem = memoryStore()
    const body = customerEvent('a@example.com')
    for (const ip of ['1.2.3.4', '34.237.3.245', null]) {
      const result = await deliver(body, webhookDeps(mem.store), sign(body), ip)
      expect(result.status).toBe(403)
    }
    expect(mem.customers.size).toBe(0)
  })

  it('fails closed with 503 when the IP list is unavailable', async () => {
    const mem = memoryStore()
    const body = customerEvent('a@example.com')
    const deps = webhookDeps(mem.store, { allowedCidrs: () => Promise.reject(new Error('down')) })
    expect((await deliver(body, deps)).status).toBe(503)
    expect(mem.customers.size).toBe(0)
  })

  it('matches CIDRs, including the IPv4-mapped IPv6 form', () => {
    expect(ipInCidrs('34.237.3.244', ['34.237.3.244/32'])).toBe(true)
    expect(ipInCidrs('::ffff:34.237.3.244', ['34.237.3.244/32'])).toBe(true)
    expect(ipInCidrs('10.1.2.3', ['10.0.0.0/8'])).toBe(true)
    for (const ip of ['34.237.3.243', '2600::1', 'not-an-ip', '256.1.1.1']) expect(ipInCidrs(ip, ['34.237.3.244/32'])).toBe(false)
    expect(ipInCidrs('34.237.3.244', ['garbage', '1.2.3.4/40'])).toBe(false)
  })

  it('reads the source address from the platform headers', () => {
    expect(sourceIp({ realIp: '34.237.3.244', forwardedFor: '9.9.9.9' })).toBe('34.237.3.244')
    expect(sourceIp({ forwardedFor: '34.237.3.244, 10.0.0.1' })).toBe('34.237.3.244')
    expect(sourceIp({ remote: '::1' })).toBe('::1')
    expect(sourceIp({})).toBeNull()
  })

  it('takes the list from the environment\'s /ips endpoint, caches it and keeps the last good list', async () => {
    expect(paddleIpsUrl('production')).toBe('https://api.paddle.com/ips')
    expect(paddleIpsUrl('sandbox')).toBe('https://sandbox-api.paddle.com/ips')
    let now = 0
    let fail = false
    const fetchJson = vi.fn(async (url: string) => {
      if (fail) throw new Error('down')
      return { data: { ipv4_cidrs: [url.includes('sandbox') ? '3.208.120.145/32' : '34.237.3.244/32'] } }
    })
    const list = createPaddleIpList({ fetchJson, now: () => now, ttlMs: 1000 })
    expect(await list('production')).toEqual(['34.237.3.244/32'])
    expect(await list('production')).toEqual(['34.237.3.244/32'])
    expect(fetchJson).toHaveBeenCalledTimes(1)
    now = 5000
    fail = true
    expect(await list('production')).toEqual(['34.237.3.244/32'])
    await expect(list('sandbox')).rejects.toThrow()
    expect(() => parseIpsResponse({ data: { ipv4_cidrs: [] } })).toThrow()
    expect(() => parseIpsResponse({})).toThrow()
  })
})

describe('webhook processing', () => {
  it('creates the customer from the API when a subscription arrives first, then links the account', async () => {
    const mem = memoryStore()
    const deps = webhookDeps(mem.store)
    const result = await deliver(subscriptionEvent({}), deps)
    expect(result.status).toBe(200)
    expect(deps.fetchCustomer).toHaveBeenCalledWith('ctm_01test')
    expect(mem.subscriptions.get('sub_01m7z0f0kkzj3w4sdt1c6k36sr')).toMatchObject({
      status: 'trialing',
      priceId: 'pri_01m7yxc793p1af7c9vnmqcmw3n',
      productId: 'pro_01m7yxc6q85jyxdnpnbd2k1wc9',
      userId: USER_ID,
    })
  })

  it('is idempotent for redeliveries and ignores out-of-order older events', async () => {
    const mem = memoryStore()
    const deps = webhookDeps(mem.store)
    await deliver(customerEvent('buyer@example.com'), deps)
    const newer = subscriptionEvent({
      type: 'subscription.updated',
      eventId: 'evt_new',
      status: 'active',
      updatedAt: '2026-11-21T13:00:00Z',
      scheduledChange: { action: 'cancel', effective_at: '2026-12-21T12:00:00Z', resume_at: null },
      customData: null,
    })
    const older = subscriptionEvent({ eventId: 'evt_old', status: 'trialing', updatedAt: '2026-11-21T12:00:00Z' })
    expect((await deliver(newer, deps)).status).toBe(200)
    expect((await deliver(newer, deps)).status).toBe(200)
    expect((await deliver(older, deps)).status).toBe(200)
    expect(mem.subscriptions.size).toBe(1)
    expect(mem.subscriptions.get('sub_01m7z0f0kkzj3w4sdt1c6k36sr')).toMatchObject({
      status: 'active',
      scheduledChangeAction: 'cancel',
      scheduledChangeAt: '2026-12-21T12:00:00Z',
    })
  })

  it('acknowledges event types it does not handle without writing', async () => {
    const mem = memoryStore()
    const body = JSON.stringify({ event_id: 'evt_x', event_type: 'product.updated', occurred_at: '2026-11-21T12:00:00Z', notification_id: null, data: { id: 'pro_1', name: 'X', tax_category: 'saas', type: 'standard', description: null, image_url: null, custom_data: null, status: 'active', import_meta: null, created_at: '2026-11-21T12:00:00Z', updated_at: '2026-11-21T12:00:00Z' } })
    expect((await deliver(body, webhookDeps(mem.store))).status).toBe(200)
    expect(mem.customers.size + mem.subscriptions.size).toBe(0)
  })

  it('answers 500 (so Paddle retries) when the database write fails', async () => {
    const mem = memoryStore()
    const failing: BillingStore = { ...mem.store, upsertCustomer: () => Promise.reject(new Error('down')) }
    expect((await deliver(customerEvent('a@example.com'), webhookDeps(failing))).status).toBe(500)
  })

  it('reads the account id from custom data only when it is a UUID', () => {
    expect(customDataUserId({ pursioUserId: USER_ID.toUpperCase() })).toBe(USER_ID)
    for (const value of [null, {}, { pursioUserId: 'ctm_x' }, { pursioUserId: 42 }, 'x']) expect(customDataUserId(value)).toBeNull()
  })
})

describe('access rules', () => {
  it('grants access for active, trialing and past_due only', () => {
    expect(['active', 'trialing', 'past_due'].map((status) => grantsPaidAccess({ status }))).toEqual([true, true, true])
    expect(['paused', 'canceled', 'something_new'].map((status) => grantsPaidAccess({ status }))).toEqual([false, false, false])
    expect(grantsPaidAccess(null)).toBe(false)
  })

  it('keeps access while a cancel is only scheduled', async () => {
    const mem = memoryStore()
    const deps = webhookDeps(mem.store)
    await deliver(customerEvent('buyer@example.com'), deps)
    await deliver(subscriptionEvent({ status: 'active', scheduledChange: { action: 'cancel', effective_at: '2026-12-21T12:00:00Z', resume_at: null } }), deps)
    const [sub] = await mem.store.subscriptionsFor({ userId: USER_ID, customerId: null })
    expect(sub?.scheduledChangeAction).toBe('cancel')
    expect(grantsPaidAccess(sub)).toBe(true)
  })

  it('prefers an access-granting subscription, then the newest', () => {
    const base = { paddleUpdatedAt: '2026-11-01T00:00:00Z' }
    expect(currentSubscription([{ ...base, status: 'canceled', paddleUpdatedAt: '2026-11-20T00:00:00Z' }, { ...base, status: 'active' }])?.status).toBe('active')
    expect(currentSubscription([{ ...base, status: 'canceled' }, { status: 'paused', paddleUpdatedAt: '2026-11-02T00:00:00Z' }])?.status).toBe('paused')
    expect(currentSubscription([])).toBeNull()
  })
})

describe('billing status and customer portal', () => {
  async function seeded() {
    const mem = memoryStore()
    const deps = webhookDeps(mem.store)
    await deliver(customerEvent('buyer@example.com'), deps)
    await deliver(subscriptionEvent({}), deps)
    return mem
  }

  function accountDeps(store: BillingStore, user: { id: string; email: string | null } | null): AccountBillingDeps & { createPortalUrl: ReturnType<typeof vi.fn> } {
    return {
      verifyUser: vi.fn(async (token: string) => (token === 'good' ? user : null)),
      store,
      configured: true,
      createPortalUrl: vi.fn(async () => 'https://sandbox-customer-portal.paddle.com/cpl_01test?token=one-time'),
    }
  }

  it('authenticates before anything else and never calls Paddle for an unknown token', async () => {
    const mem = await seeded()
    const deps = accountDeps(mem.store, { id: USER_ID, email: 'buyer@example.com' })
    for (const authorization of [undefined, 'Bearer bad', 'Basic good']) {
      expect((await handleBillingPortal({ authorization }, deps)).status).toBe(401)
      expect((await handleBillingStatus({ authorization }, deps)).status).toBe(401)
    }
    expect(deps.createPortalUrl).not.toHaveBeenCalled()
  })

  it('mints a portal session for the customer matching the verified email and returns only the URL', async () => {
    const mem = await seeded()
    const deps = accountDeps(mem.store, { id: USER_ID, email: 'buyer@example.com' })
    const result = await handleBillingPortal({ authorization: 'Bearer good' }, deps)
    expect(result).toEqual({ status: 200, body: { url: 'https://sandbox-customer-portal.paddle.com/cpl_01test?token=one-time' } })
    expect(deps.createPortalUrl).toHaveBeenCalledWith('ctm_01test', ['sub_01m7z0f0kkzj3w4sdt1c6k36sr'])
  })

  it('never opens a portal from custom data alone: no verified email means no customer', async () => {
    const mem = await seeded()
    // The subscription is linked to USER_ID by custom data, but the account has no verified email.
    const deps = accountDeps(mem.store, { id: USER_ID, email: null })
    expect((await handleBillingPortal({ authorization: 'Bearer good' }, deps)).status).toBe(404)
    expect(deps.createPortalUrl).not.toHaveBeenCalled()
    const status = await handleBillingStatus({ authorization: 'Bearer good' }, deps)
    expect(status.body).toMatchObject({ access: true, canManage: false, customerId: null })
  })

  it('reports access and the plan for the account', async () => {
    const mem = await seeded()
    const status = await handleBillingStatus({ authorization: 'Bearer good' }, accountDeps(mem.store, { id: 'other-user', email: 'buyer@example.com' }))
    expect(status).toEqual({
      status: 200,
      body: {
        access: true,
        subscription: { status: 'trialing', priceId: 'pri_01m7yxc793p1af7c9vnmqcmw3n', scheduledChange: null, nextBilledAt: '2026-11-28T12:00:00Z' },
        canManage: true,
        customerId: 'ctm_01test',
      },
    })
    const stranger = await handleBillingStatus({ authorization: 'Bearer good' }, accountDeps(mem.store, { id: 'stranger', email: 'x@example.com' }))
    expect(stranger.body).toEqual({ access: false, subscription: null, canManage: false, customerId: null })
  })
})

describe('server Paddle environment', () => {
  it('has no default and rejects a key from the other environment', () => {
    expect(paddleServerEnvironment('sandbox', 'pdl_sdbx_apikey_x')).toBe(Environment.sandbox)
    expect(paddleServerEnvironment('production', '')).toBe(Environment.production)
    expect(() => paddleServerEnvironment('', 'pdl_sdbx_apikey_x')).toThrow(/unset/)
    expect(() => paddleServerEnvironment('sandbox', 'pdl_live_apikey_secretish')).toThrow(/pdl_sdbx_apikey_/)
    expect(() => paddleServerEnvironment('sandbox', 'pdl_live_apikey_secretish')).not.toThrow(/secretish/)
  })
})
