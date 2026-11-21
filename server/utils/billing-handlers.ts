import {
  EventName,
  type AdjustmentCreatedEvent,
  type AdjustmentUpdatedEvent,
  type CustomerCreatedEvent,
  type CustomerUpdatedEvent,
  type EventEntity,
  type SubscriptionCanceledEvent,
  type SubscriptionCreatedEvent,
  type SubscriptionUpdatedEvent,
  type TransactionCompletedEvent,
} from '@paddle/paddle-node-sdk'
import type {
  BillingErrorCode,
  BillingErrorResponse,
  BillingStatusResponse,
  FoundingAvailabilityResponse,
  MirroredSubscription,
  PortalResponse,
  ScheduledChangeAction,
} from '../../shared/types/billing'
import { parseBearer } from '../../shared/utils/auth'
import { currentSubscription, grantsPaidAccess } from '../../shared/utils/billing-access'
import { FOUNDING_LIMIT, isFoundingPrice, type PaddleEnvironment } from '../../shared/utils/paddle-catalog'
import type { HandlerResponse } from './llm-handlers'

// Paddle fulfillment: verified webhooks mirror customers, subscriptions and
// completed transactions into Supabase; the account's billing status and
// customer portal read that mirror. All I/O comes in through deps.

// ---------------------------------------------------------------------------
// Rows written from webhook events

export interface CustomerRow {
  customerId: string
  email: string
  paddleUpdatedAt: string
}

export interface SubscriptionRow {
  subscriptionId: string
  customerId: string
  /** From the checkout's custom data; null when absent or not a UUID. */
  userId: string | null
  status: string
  priceId: string
  productId: string
  scheduledChangeAction: ScheduledChangeAction | null
  scheduledChangeAt: string | null
  nextBilledAt: string | null
  paddleUpdatedAt: string
}

export interface TransactionRow {
  transactionId: string
  customerId: string | null
  subscriptionId: string | null
  userId: string | null
  status: string
  origin: string
  currencyCode: string
  grandTotal: string
  billedAt: string | null
  paddleUpdatedAt: string
}

/** A completed founding purchase (table `founding_members`). */
export interface FoundingMemberRow {
  transactionId: string
  customerId: string
  userId: string | null
  purchasedAt: string
}

/** `written`, `stale` (the stored row is newer) or `missing_customer` (the customer row doesn't exist yet). */
export type UpsertResult = 'written' | 'stale' | 'missing_customer'

/** The mirror. Every write is an upsert keyed on the Paddle id that only moves a row forward. */
export interface BillingStore {
  upsertCustomer(row: CustomerRow): Promise<UpsertResult>
  upsertSubscription(row: SubscriptionRow): Promise<UpsertResult>
  upsertTransaction(row: TransactionRow): Promise<UpsertResult>
  /** The Paddle customer whose (lowercased) email equals this one, or null. */
  customerIdByEmail(email: string): Promise<string | null>
  /** Subscriptions linked to this account by custom data, or belonging to this customer. */
  subscriptionsFor(query: { userId: string; customerId: string | null }): Promise<MirroredSubscription[]>
  /** Records a founding purchase. Idempotent; needs the customer row, like the other writes. */
  recordFoundingMember(row: FoundingMemberRow): Promise<UpsertResult>
  /** Ends the membership bought with this transaction. False when the transaction is not a founding purchase. */
  markFoundingRefunded(transactionId: string, refundedAt: string): Promise<boolean>
  /** Founding memberships sold and not refunded. */
  foundingSold(): Promise<number>
  /** Whether this account (by custom data) or this customer holds a membership that was not refunded. */
  isFoundingMember(query: { userId: string; customerId: string | null }): Promise<boolean>
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The Pursio user id the checkout put in custom data (`pursioUserId`), or null. */
export function customDataUserId(customData: unknown): string | null {
  if (typeof customData !== 'object' || customData === null) return null
  const value: unknown = (customData as Record<string, unknown>).pursioUserId
  return typeof value === 'string' && UUID.test(value) ? value.toLowerCase() : null
}

type SubscriptionEvent = SubscriptionCreatedEvent | SubscriptionUpdatedEvent | SubscriptionCanceledEvent

export function subscriptionRow(data: SubscriptionEvent['data']): SubscriptionRow {
  // Pursio sells one price per subscription; the first item is the plan.
  const price = data.items[0]?.price ?? null
  return {
    subscriptionId: data.id,
    customerId: data.customerId,
    userId: customDataUserId(data.customData),
    status: data.status,
    priceId: price?.id ?? '',
    productId: price?.productId ?? '',
    scheduledChangeAction: data.scheduledChange?.action ?? null,
    scheduledChangeAt: data.scheduledChange?.effectiveAt ?? null,
    nextBilledAt: data.nextBilledAt,
    paddleUpdatedAt: data.updatedAt,
  }
}

export function customerRow(data: (CustomerCreatedEvent | CustomerUpdatedEvent)['data']): CustomerRow {
  return { customerId: data.id, email: data.email.trim().toLowerCase(), paddleUpdatedAt: data.updatedAt }
}

export function transactionRow(data: TransactionCompletedEvent['data']): TransactionRow {
  return {
    transactionId: data.id,
    customerId: data.customerId,
    subscriptionId: data.subscriptionId,
    userId: customDataUserId(data.customData),
    status: data.status,
    origin: data.origin,
    currencyCode: data.currencyCode,
    grandTotal: data.details?.totals?.grandTotal ?? '0',
    billedAt: data.billedAt,
    paddleUpdatedAt: data.updatedAt,
  }
}

// ---------------------------------------------------------------------------
// POST /api/paddle/webhook

export type WebhookLogCode =
  | 'founding_over_limit'
  | 'missing_input'
  | 'not_configured'
  | 'source_denied'
  | 'source_list_unavailable'
  | 'unverified'
  | 'handler_failed'

export interface WebhookDeps {
  /** The notification destination's signing secret (not the API key). */
  secret: string
  /** The Paddle environment the server runs against; picks which price ID is the founding one. */
  environment: PaddleEnvironment
  /** Paddle's current webhook source CIDRs for this environment (from its /ips endpoint). Throws when unavailable. */
  allowedCidrs(): Promise<string[]>
  /** Whether the source address is inside the CIDRs. */
  ipAllowed(ip: string, cidrs: readonly string[]): boolean
  /** `paddle.webhooks.unmarshal`: verifies the signature over the raw body, then parses. Throws when invalid. */
  unmarshal(rawBody: string, secret: string, signature: string): Promise<EventEntity>
  store: BillingStore
  /** Reads a customer from the Paddle API, for a subscription or transaction that arrives before its customer.created. */
  fetchCustomer(customerId: string): Promise<CustomerRow>
  /** Logs ids and codes only, never bodies, emails or secrets. */
  log?(entry: { code: WebhookLogCode | 'processed' | 'ignored'; eventType?: string; eventId?: string; reason?: string }): void
}

/**
 * A short fixed label for why processing failed (e.g. `paddle_upsert_subscription:PGRST202`),
 * read from `error.reason`. Anything else becomes `unknown`, so no message,
 * row data or secret can reach a log or a response.
 */
export function failureReason(error: unknown): string {
  const reason: unknown = typeof error === 'object' && error !== null ? (error as { reason?: unknown }).reason : undefined
  return typeof reason === 'string' && /^[a-z_]{1,40}(:[A-Za-z0-9_]{1,24})?$/.test(reason) ? reason : 'unknown'
}

/** An error carrying a fixed `reason` label (see `failureReason`). */
export function reasonError(reason: string): Error {
  return Object.assign(new Error('billing_failed'), { reason })
}

export type WebhookOutcome = 'written' | 'stale' | 'ignored'

/** Writes a row that references a customer, creating the customer from the API first when it's missing. */
async function withCustomer(
  customerId: string | null,
  write: () => Promise<UpsertResult>,
  deps: WebhookDeps,
): Promise<WebhookOutcome> {
  const first = await write()
  if (first !== 'missing_customer') return first
  if (customerId === null) throw reasonError('missing_customer')
  await deps.store.upsertCustomer(await deps.fetchCustomer(customerId))
  const second = await write()
  if (second === 'missing_customer') throw reasonError('missing_customer')
  return second
}

/**
 * Founding fulfillment: a completed transaction that contains the founding price
 * makes its buyer a founding member. Runs on every delivery of the event, stale
 * ones included, and is idempotent. The limit of 50 is enforced before checkout
 * (see `handleFoundingAvailability`); a purchase that still lands beyond it is
 * recorded and honored, and logged so the owner can decide what to do.
 */
async function fulfilFounding(event: TransactionCompletedEvent, row: TransactionRow, deps: WebhookDeps): Promise<void> {
  const founding = event.data.items.some((item) => isFoundingPrice(item.price?.id, deps.environment))
  if (!founding) return
  if (row.customerId === null) throw reasonError('founding_no_customer')
  const member: FoundingMemberRow = {
    transactionId: row.transactionId,
    customerId: row.customerId,
    userId: row.userId,
    purchasedAt: row.billedAt ?? event.data.createdAt,
  }
  // The customer row exists: the transaction upsert just before this needed it.
  if ((await deps.store.recordFoundingMember(member)) === 'missing_customer') throw reasonError('missing_customer')
  if ((await deps.store.foundingSold()) > FOUNDING_LIMIT) {
    deps.log?.({ code: 'founding_over_limit', eventType: event.eventType, eventId: event.eventId })
  }
}

/**
 * An approved refund or chargeback of a founding purchase ends the membership
 * (the perks end and the spot is free again). Adjustments of other transactions,
 * and ones still pending approval, change nothing.
 */
async function revokeFoundingOnRefund(event: AdjustmentCreatedEvent | AdjustmentUpdatedEvent, deps: WebhookDeps): Promise<boolean> {
  const { action, status, transactionId, updatedAt } = event.data
  if ((action !== 'refund' && action !== 'chargeback') || status !== 'approved') return false
  return deps.store.markFoundingRefunded(transactionId, updatedAt)
}

/** Routes a verified event. Handled types upsert; every other type is ignored. Idempotent for redeliveries. */
export async function processEvent(event: EventEntity, deps: WebhookDeps): Promise<WebhookOutcome> {
  switch (event.eventType) {
    case EventName.SubscriptionCreated:
    case EventName.SubscriptionUpdated:
    case EventName.SubscriptionCanceled: {
      const row = subscriptionRow(event.data)
      return withCustomer(row.customerId, () => deps.store.upsertSubscription(row), deps)
    }
    case EventName.CustomerCreated:
    case EventName.CustomerUpdated: {
      const result = await deps.store.upsertCustomer(customerRow(event.data))
      return result === 'stale' ? 'stale' : 'written'
    }
    case EventName.TransactionCompleted: {
      const row = transactionRow(event.data)
      const outcome = await withCustomer(row.customerId, () => deps.store.upsertTransaction(row), deps)
      await fulfilFounding(event, row, deps)
      return outcome
    }
    case EventName.AdjustmentCreated:
    case EventName.AdjustmentUpdated:
      return (await revokeFoundingOnRefund(event, deps)) ? 'written' : 'ignored'
    default:
      return 'ignored'
  }
}

/**
 * Verifies, then processes. Only a verified and fully processed (or ignored)
 * event gets a 2xx; anything else is a non-2xx so Paddle retries it.
 */
export async function handlePaddleWebhook(
  input: { rawBody: string | undefined; signature: string | undefined; sourceIp: string | null },
  deps: WebhookDeps,
): Promise<HandlerResponse<{ received: true } | { error: string; reason?: string }>> {
  // Only Paddle's published addresses may deliver. Checked first and fail-closed:
  // without the list nothing is accepted (503, so Paddle retries later).
  let cidrs: string[]
  try {
    cidrs = await deps.allowedCidrs()
  } catch {
    deps.log?.({ code: 'source_list_unavailable' })
    return { status: 503, body: { error: 'source_list_unavailable' } }
  }
  if (input.sourceIp === null || !deps.ipAllowed(input.sourceIp, cidrs)) {
    deps.log?.({ code: 'source_denied' })
    return { status: 403, body: { error: 'forbidden_source' } }
  }

  const signature = input.signature?.trim() ?? ''
  const rawBody = input.rawBody ?? ''
  if (signature === '' || rawBody === '') {
    deps.log?.({ code: 'missing_input' })
    return { status: 400, body: { error: 'missing_signature_or_body' } }
  }
  if (deps.secret.trim() === '') {
    deps.log?.({ code: 'not_configured' })
    return { status: 500, body: { error: 'not_configured' } }
  }

  let event: EventEntity
  try {
    event = await deps.unmarshal(rawBody, deps.secret, signature)
  } catch {
    deps.log?.({ code: 'unverified' })
    return { status: 401, body: { error: 'invalid_signature' } }
  }

  try {
    const outcome = await processEvent(event, deps)
    deps.log?.({ code: outcome === 'ignored' ? 'ignored' : 'processed', eventType: event.eventType, eventId: event.eventId })
    return { status: 200, body: { received: true } }
  } catch (error) {
    // Only reached after the signature verified, so only Paddle sees the label
    // (in the notification log); it is a fixed code, never data.
    const reason = failureReason(error)
    deps.log?.({ code: 'handler_failed', eventType: event.eventType, eventId: event.eventId, reason })
    return { status: 500, body: { error: 'handler_failed', reason } }
  }
}

// ---------------------------------------------------------------------------
// GET /api/billing/status and POST /api/billing/portal

/** The account behind a verified Access_Token. `email` is set only for a confirmed, non-anonymous email. */
export interface VerifiedUser {
  id: string
  email: string | null
}

export interface AccountBillingDeps {
  verifyUser(token: string): Promise<VerifiedUser | null>
  store: BillingStore
  /** False when the API key, environment or service role key is missing. */
  configured: boolean
  /** `paddle.customerPortalSessions.create`; returns the portal overview URL. */
  createPortalUrl(customerId: string, subscriptionIds: string[]): Promise<string>
  log?(entry: { code: BillingErrorCode }): void
}

export const BILLING_ERROR_STATUS: Record<BillingErrorCode, number> = {
  unauthorized: 401,
  no_customer: 404,
  not_configured: 503,
  failed: 502,
}

function billingError(code: BillingErrorCode, deps: AccountBillingDeps): HandlerResponse<BillingErrorResponse> {
  deps.log?.({ code })
  return { status: BILLING_ERROR_STATUS[code], body: { error: code } }
}

/** Authenticates first. Only the Authorization header is an input; no customer id is ever read from the client. */
async function authenticate(authorization: string | undefined, deps: AccountBillingDeps): Promise<VerifiedUser | null> {
  const token = parseBearer(authorization)
  if (token === null) return null
  try {
    const user = await deps.verifyUser(token)
    return user && user.id !== '' ? user : null
  } catch {
    return null
  }
}

async function customerIdFor(user: VerifiedUser, store: BillingStore): Promise<string | null> {
  return user.email === null ? null : store.customerIdByEmail(user.email)
}

/**
 * Whether the account has paid access now: a founding membership that was not
 * refunded, or a subscription that grants access. The same rule as `access` in
 * the billing status, for server code that needs only the answer.
 */
export async function accountHasPaidAccess(user: VerifiedUser, store: BillingStore): Promise<boolean> {
  const query = { userId: user.id, customerId: await customerIdFor(user, store) }
  if (await store.isFoundingMember(query)) return true
  return grantsPaidAccess(currentSubscription(await store.subscriptionsFor(query)))
}

export async function handleBillingStatus(
  input: { authorization: string | undefined },
  deps: AccountBillingDeps,
): Promise<HandlerResponse<BillingStatusResponse | BillingErrorResponse>> {
  const user = await authenticate(input.authorization, deps)
  if (!user) return billingError('unauthorized', deps)
  if (!deps.configured) return billingError('not_configured', deps)
  try {
    const customerId = await customerIdFor(user, deps.store)
    const query = { userId: user.id, customerId }
    const [subs, founding] = await Promise.all([deps.store.subscriptionsFor(query), deps.store.isFoundingMember(query)])
    const sub = currentSubscription(subs)
    return {
      status: 200,
      body: {
        // A founding member has Plus for life, with or without a subscription.
        access: founding || grantsPaidAccess(sub),
        founding,
        subscription: sub && {
          status: sub.status,
          priceId: sub.priceId,
          scheduledChange:
            sub.scheduledChangeAction && sub.scheduledChangeAt
              ? { action: sub.scheduledChangeAction, at: sub.scheduledChangeAt }
              : null,
          nextBilledAt: sub.nextBilledAt,
        },
        canManage: customerId !== null,
        customerId,
      },
    }
  } catch {
    return billingError('failed', deps)
  }
}

/**
 * Mints a one-time customer portal URL for the signed-in account. The Paddle
 * customer is resolved on the server from the account's verified email only
 * (custom data is client-supplied, so it never selects whose portal opens).
 */
export async function handleBillingPortal(
  input: { authorization: string | undefined },
  deps: AccountBillingDeps,
): Promise<HandlerResponse<PortalResponse | BillingErrorResponse>> {
  const user = await authenticate(input.authorization, deps)
  if (!user) return billingError('unauthorized', deps)
  if (!deps.configured) return billingError('not_configured', deps)
  try {
    const customerId = await customerIdFor(user, deps.store)
    if (customerId === null) return billingError('no_customer', deps)
    const subs = await deps.store.subscriptionsFor({ userId: user.id, customerId })
    // Deep links only for this customer's own subscriptions.
    const ids = subs.filter((s) => s.customerId === customerId).map((s) => s.subscriptionId)
    const url = await deps.createPortalUrl(customerId, ids)
    return { status: 200, body: { url } }
  } catch {
    return billingError('failed', deps)
  }
}

// ---------------------------------------------------------------------------
// GET /api/founding/availability

/**
 * Whether a founding membership can still be bought: fewer than 50 are sold
 * and not refunded. Public, with no input. The card asks this before it opens
 * checkout. Paddle itself has no stock limit, so two buyers who check out at
 * the same moment for the last spot can both get through; see `fulfilFounding`.
 */
export async function handleFoundingAvailability(deps: {
  store: Pick<BillingStore, 'foundingSold'>
}): Promise<HandlerResponse<FoundingAvailabilityResponse | BillingErrorResponse>> {
  try {
    return { status: 200, body: { available: (await deps.store.foundingSold()) < FOUNDING_LIMIT } }
  } catch {
    return { status: 502, body: { error: 'failed' } }
  }
}
