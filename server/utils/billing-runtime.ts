import { Environment, LogLevel, Paddle } from '@paddle/paddle-node-sdk'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { MirroredSubscription, ScheduledChangeAction } from '../../shared/types/billing'
import { createPaddleIpList, ipInCidrs } from './paddle-ips'
import { accountHasPaidAccess, reasonError, type AccountBillingDeps, type BillingStore, type UpsertResult, type VerifiedUser, type WebhookDeps } from './billing-handlers'

// Server-only wiring for Paddle billing. Reads NUXT_PADDLE_API_KEY,
// NUXT_PADDLE_WEBHOOK_SECRET, NUXT_PUBLIC_PADDLE_ENV and the Supabase service
// role key. None of them is ever logged or returned.

const SERVER_AUTH = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } as const

/** An API key belongs to one environment, shown by its prefix. */
const API_KEY_PREFIX = { sandbox: 'pdl_sdbx_apikey_', production: 'pdl_live_apikey_' } as const

/**
 * The Paddle environment, with no default: throws when NUXT_PUBLIC_PADDLE_ENV
 * is unset or unknown, or when the API key belongs to the other environment.
 * An empty API key is allowed here (signature checks don't need one); calls
 * that need it fail on their own.
 */
export function paddleServerEnvironment(environment: string, apiKey: string): Environment {
  const env = environment.trim()
  if (env !== 'sandbox' && env !== 'production') {
    throw new Error(`NUXT_PUBLIC_PADDLE_ENV must be "sandbox" or "production"; ${env === '' ? 'it is unset' : `got "${env}"`}.`)
  }
  const key = apiKey.trim()
  if (key !== '' && !key.startsWith(API_KEY_PREFIX[env])) {
    throw new Error(`NUXT_PADDLE_API_KEY does not match NUXT_PUBLIC_PADDLE_ENV=${env}: a ${env} API key starts with "${API_KEY_PREFIX[env]}".`)
  }
  return env === 'sandbox' ? Environment.sandbox : Environment.production
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

interface BillingConfig {
  paddle: Paddle | null
  /** Null when NUXT_PUBLIC_PADDLE_ENV or the API key is invalid. */
  environment: 'sandbox' | 'production' | null
  apiKey: string
  webhookSecret: string
  supabaseUrl: string
  serviceRoleKey: string
  anonKey: string
}

let cached: { signature: string; paddle: Paddle } | null = null

function billingConfig(): BillingConfig {
  const config = useRuntimeConfig()
  const apiKey = text(config.paddleApiKey)
  const env = text(config.public.paddleEnv)
  let paddle: Paddle | null = null
  let environmentName: BillingConfig['environment'] = null
  try {
    const environment = paddleServerEnvironment(env, apiKey)
    environmentName = environment === Environment.sandbox ? 'sandbox' : 'production'
    const signature = `${environment}:${apiKey}`
    if (cached?.signature !== signature) {
      cached = { signature, paddle: new Paddle(apiKey, { environment, logLevel: LogLevel.error }) }
    }
    paddle = cached.paddle
  } catch (error) {
    console.error('[billing]', error instanceof Error ? error.message : 'invalid Paddle config')
  }
  return {
    paddle,
    environment: environmentName,
    apiKey,
    webhookSecret: text(config.paddleWebhookSecret),
    supabaseUrl: text(config.public.supabaseUrl),
    serviceRoleKey: text(config.supabaseServiceRoleKey),
    anonKey: text(config.public.supabaseAnonKey),
  }
}

// ---------------------------------------------------------------------------
// Supabase mirror (service role; the tables have RLS with no policy)

/** `op:code` with the Postgres/PostgREST code only when it is a short safe token. */
function dbReason(op: string, error: { code?: unknown } | null): string {
  const code = error?.code
  return typeof code === 'string' && /^[A-Za-z0-9_]{1,24}$/.test(code) ? `${op}:${code}` : op
}

function rpcResult(op: string, error: { code?: string } | null, data: unknown): UpsertResult {
  // 23503: foreign key violation, i.e. the customer row doesn't exist yet.
  if (error?.code === '23503') return 'missing_customer'
  if (error) throw reasonError(dbReason(op, error))
  return data === true ? 'written' : 'stale'
}

function subscriptionFromRow(row: Record<string, unknown>): MirroredSubscription | null {
  if (typeof row.subscription_id !== 'string' || typeof row.customer_id !== 'string' || typeof row.status !== 'string') return null
  const action = row.scheduled_change_action
  return {
    subscriptionId: row.subscription_id,
    customerId: row.customer_id,
    status: row.status,
    priceId: typeof row.price_id === 'string' ? row.price_id : '',
    productId: typeof row.product_id === 'string' ? row.product_id : '',
    scheduledChangeAction: action === 'cancel' || action === 'pause' || action === 'resume' ? (action as ScheduledChangeAction) : null,
    scheduledChangeAt: typeof row.scheduled_change_at === 'string' ? row.scheduled_change_at : null,
    nextBilledAt: typeof row.next_billed_at === 'string' ? row.next_billed_at : null,
    paddleUpdatedAt: typeof row.paddle_updated_at === 'string' ? row.paddle_updated_at : new Date(0).toISOString(),
  }
}

const SUBSCRIPTION_COLUMNS =
  'subscription_id, customer_id, status, price_id, product_id, scheduled_change_action, scheduled_change_at, next_billed_at, paddle_updated_at'

export function supabaseBillingStore(admin: SupabaseClient): BillingStore {
  return {
    async upsertCustomer(row) {
      const { data, error } = await admin.rpc('paddle_upsert_customer', {
        p_customer_id: row.customerId,
        p_email: row.email,
        p_paddle_updated_at: row.paddleUpdatedAt,
      })
      return rpcResult('paddle_upsert_customer', error, data)
    },
    async upsertSubscription(row) {
      const { data, error } = await admin.rpc('paddle_upsert_subscription', {
        p_subscription_id: row.subscriptionId,
        p_customer_id: row.customerId,
        p_user_id: row.userId,
        p_status: row.status,
        p_price_id: row.priceId,
        p_product_id: row.productId,
        p_scheduled_change_action: row.scheduledChangeAction,
        p_scheduled_change_at: row.scheduledChangeAt,
        p_next_billed_at: row.nextBilledAt,
        p_paddle_updated_at: row.paddleUpdatedAt,
      })
      return rpcResult('paddle_upsert_subscription', error, data)
    },
    async upsertTransaction(row) {
      const { data, error } = await admin.rpc('paddle_upsert_transaction', {
        p_transaction_id: row.transactionId,
        p_customer_id: row.customerId,
        p_subscription_id: row.subscriptionId,
        p_user_id: row.userId,
        p_status: row.status,
        p_origin: row.origin,
        p_currency_code: row.currencyCode,
        p_grand_total: row.grandTotal,
        p_billed_at: row.billedAt,
        p_paddle_updated_at: row.paddleUpdatedAt,
      })
      return rpcResult('paddle_upsert_transaction', error, data)
    },
    async customerIdByEmail(email) {
      const { data, error } = await admin
        .from('customers')
        .select('customer_id')
        .eq('email', email.trim().toLowerCase())
        .order('paddle_updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw reasonError(dbReason('customers_read', error))
      const row: { customer_id?: unknown } | null = data
      return typeof row?.customer_id === 'string' ? row.customer_id : null
    },
    async recordFoundingMember(row) {
      const { error } = await admin.rpc('paddle_record_founding_member', {
        p_transaction_id: row.transactionId,
        p_customer_id: row.customerId,
        p_user_id: row.userId,
        p_purchased_at: row.purchasedAt,
      })
      return rpcResult('paddle_record_founding_member', error, true)
    },
    async markFoundingRefunded(transactionId, refundedAt) {
      // Only a membership that is not refunded yet, so a redelivery keeps the first date.
      const { data, error } = await admin
        .from('founding_members')
        .update({ refunded_at: refundedAt })
        .eq('transaction_id', transactionId)
        .is('refunded_at', null)
        .select('transaction_id')
      if (error) throw reasonError(dbReason('founding_refund', error))
      return Array.isArray(data) && data.length > 0
    },
    async foundingSold() {
      const { count, error } = await admin
        .from('founding_members')
        .select('transaction_id', { count: 'exact', head: true })
        .is('refunded_at', null)
      if (error || typeof count !== 'number') throw reasonError(dbReason('founding_count', error))
      return count
    },
    async isFoundingMember({ userId, customerId }) {
      const base = () => admin.from('founding_members').select('transaction_id', { count: 'exact', head: true }).is('refunded_at', null)
      const queries = [base().eq('user_id', userId)]
      if (customerId !== null) queries.push(base().eq('customer_id', customerId))
      const results = await Promise.all(queries)
      for (const { error } of results) if (error) throw reasonError(dbReason('founding_read', error))
      return results.some(({ count }) => typeof count === 'number' && count > 0)
    },
    async subscriptionsFor({ userId, customerId }) {
      // Two plain equality queries instead of an `or` filter string.
      const queries = [admin.from('subscriptions').select(SUBSCRIPTION_COLUMNS).eq('user_id', userId)]
      if (customerId !== null) queries.push(admin.from('subscriptions').select(SUBSCRIPTION_COLUMNS).eq('customer_id', customerId))
      const results = await Promise.all(queries)
      const byId = new Map<string, MirroredSubscription>()
      for (const { data, error } of results) {
        if (error) throw reasonError(dbReason('subscriptions_read', error))
        const rows: unknown = data
        if (!Array.isArray(rows)) continue
        for (const raw of rows) {
          if (typeof raw !== 'object' || raw === null) continue
          const sub = subscriptionFromRow(raw as Record<string, unknown>)
          if (sub) byId.set(sub.subscriptionId, sub)
        }
      }
      return [...byId.values()]
    },
  }
}

function adminClient(config: BillingConfig): SupabaseClient | null {
  if (config.supabaseUrl === '' || config.serviceRoleKey === '') return null
  return createClient(config.supabaseUrl, config.serviceRoleKey, { auth: SERVER_AUTH })
}

/** A store that fails every call, for a server without the Supabase service role key. */
const UNCONFIGURED_STORE: BillingStore = {
  upsertCustomer: () => Promise.reject(reasonError('not_configured')),
  upsertSubscription: () => Promise.reject(reasonError('not_configured')),
  upsertTransaction: () => Promise.reject(reasonError('not_configured')),
  customerIdByEmail: () => Promise.reject(reasonError('not_configured')),
  subscriptionsFor: () => Promise.reject(reasonError('not_configured')),
  recordFoundingMember: () => Promise.reject(reasonError('not_configured')),
  markFoundingRefunded: () => Promise.reject(reasonError('not_configured')),
  foundingSold: () => Promise.reject(reasonError('not_configured')),
  isFoundingMember: () => Promise.reject(reasonError('not_configured')),
}

// ---------------------------------------------------------------------------
// Route deps

/** Logs codes, event types and event ids only. */
function logWebhook(entry: { code: string; eventType?: string; eventId?: string; reason?: string }): void {
  const line = { code: entry.code, eventType: entry.eventType, eventId: entry.eventId, reason: entry.reason }
  if (entry.code === 'processed' || entry.code === 'ignored') console.info('[paddle-webhook]', line)
  else console.error('[paddle-webhook]', line)
}

/** Paddle's webhook source IPs, refreshed hourly; a failed refresh keeps the last good list. */
const paddleIps = createPaddleIpList({
  async fetchJson(url) {
    const response = await fetch(url, { signal: AbortSignal.timeout(3_000) })
    if (!response.ok) throw new Error('paddle_ips_http')
    return response.json()
  },
  now: () => Date.now(),
  ttlMs: 60 * 60 * 1000,
})

export function paddleWebhookDeps(): WebhookDeps {
  const config = billingConfig()
  const admin = adminClient(config)
  const paddle = config.paddle
  return {
    // An unusable environment or missing database means "not configured": the route answers 500 and Paddle retries.
    secret: paddle && admin ? config.webhookSecret : '',
    // Unused while `secret` is empty (no valid environment): the route answers 500 first.
    environment: config.environment ?? 'sandbox',
    allowedCidrs: () => (config.environment ? paddleIps(config.environment) : Promise.reject(new Error('not_configured'))),
    ipAllowed: ipInCidrs,
    unmarshal: (rawBody, secret, signature) => {
      if (!paddle) return Promise.reject(new Error('not_configured'))
      return paddle.webhooks.unmarshal(rawBody, secret, signature)
    },
    store: admin ? supabaseBillingStore(admin) : UNCONFIGURED_STORE,
    async fetchCustomer(customerId) {
      if (!paddle || config.apiKey === '') throw reasonError('fetch_customer:no_api_key')
      let customer: Awaited<ReturnType<Paddle['customers']['get']>>
      try {
        customer = await paddle.customers.get(customerId)
      } catch (error) {
        // ApiError.code is a Paddle error code such as `forbidden` or `not_found`.
        const code: unknown = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined
        throw reasonError(typeof code === 'string' && /^[a-z_]{1,24}$/.test(code) ? `fetch_customer:${code}` : 'fetch_customer')
      }
      return { customerId: customer.id, email: customer.email.trim().toLowerCase(), paddleUpdatedAt: customer.updatedAt }
    },
    log: logWebhook,
  }
}

export function accountBillingDeps(): AccountBillingDeps {
  const config = billingConfig()
  const admin = adminClient(config)
  const paddle = config.paddle
  return {
    async verifyUser(token): Promise<VerifiedUser | null> {
      if (config.supabaseUrl === '' || config.anonKey === '') return null
      const client = createClient(config.supabaseUrl, config.anonKey, { auth: SERVER_AUTH })
      const { data, error } = await client.auth.getUser(token)
      if (error || !data.user) return null
      const user = data.user
      // Only a confirmed email on a real account bridges to a Paddle customer.
      const email = user.is_anonymous !== true && user.email && user.email_confirmed_at ? user.email.trim().toLowerCase() : null
      return { id: user.id, email }
    },
    store: admin ? supabaseBillingStore(admin) : UNCONFIGURED_STORE,
    configured: paddle !== null && config.apiKey !== '' && admin !== null,
    async createPortalUrl(customerId, subscriptionIds) {
      if (!paddle) throw new Error('not_configured')
      const session = await paddle.customerPortalSessions.create(customerId, subscriptionIds)
      return session.urls.general.overview
    },
    log: (entry) => console.error('[billing]', { code: entry.code }),
  }
}

/** Dependencies of `GET /api/founding/availability`. */
export function foundingAvailabilityDeps(): { store: BillingStore } {
  const admin = adminClient(billingConfig())
  return { store: admin ? supabaseBillingStore(admin) : UNCONFIGURED_STORE }
}

/**
 * Whether the account behind this Access_Token has paid access (a founding
 * membership or Plus). Read from the billing mirror on the server; nothing the
 * client sends is used. Throws when the token is not valid or billing is not set up.
 */
export async function paidAccessForToken(token: string): Promise<boolean> {
  const deps = accountBillingDeps()
  const user = await deps.verifyUser(token)
  if (!user) throw reasonError('limit_check:no_user')
  return accountHasPaidAccess(user, deps.store)
}
