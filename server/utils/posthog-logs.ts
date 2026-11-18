import { PostHog } from 'posthog-node'

type SkillPathOutcome = 'completed' | 'rejected' | 'failed'

let client: PostHog | undefined
let warnedMissingConfig = false

function posthogLogClient(): PostHog | undefined {
  if (client) return client

  const key = process.env.NUXT_PUBLIC_POSTHOG_KEY
  const host = process.env.NUXT_PUBLIC_POSTHOG_HOST
  if (!key || !host) {
    if (process.env.NODE_ENV !== 'production' && !warnedMissingConfig) {
      warnedMissingConfig = true
      const variable = !key ? 'NUXT_PUBLIC_POSTHOG_KEY' : 'NUXT_PUBLIC_POSTHOG_HOST'
      console.warn(`${variable} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${variable} is configured`)
    }
    return undefined
  }

  client = new PostHog(key, {
    host,
    logs: { serviceName: 'pursio-nitro' },
    flushAt: 1,
    flushInterval: 0,
    requestTimeout: 2000,
    fetchRetryCount: 0,
  })
  return client
}

/** Emits only purpose-written server logs from this module; existing application logs stay local. */
export async function logSkillPathRequest(status: number): Promise<void> {
  const posthog = posthogLogClient()
  if (!posthog) return

  const outcome: SkillPathOutcome = status === 200 ? 'completed' : status >= 500 ? 'failed' : 'rejected'
  const attributes = {
    route: '/api/tree',
    http_status: status,
    outcome,
  }

  try {
    if (outcome === 'completed') {
      posthog.logger.info('skill_path_generation_completed', attributes)
    } else if (outcome === 'failed') {
      posthog.logger.error('skill_path_generation_failed', attributes)
    } else {
      posthog.logger.warn('skill_path_generation_rejected', attributes)
    }
    await posthog.flush().catch(() => {})
  } catch {
    // Logging must never change the API response.
  }
}
