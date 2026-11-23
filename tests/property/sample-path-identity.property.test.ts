// Feature: sample-path, Property 6: Server identity
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { ANALYTICS_ID_MAX } from '../../shared/utils/analytics-identity'
import { currentAiObservabilityContext } from '../../server/utils/ai-observability'
import { readAnalyticsIdentity, type AnalyticsIdentity } from '../../server/utils/analytics-events'
import { handleTreeRequest } from '../../server/utils/llm-handlers'
import { TOKEN, USER_ID, bearer, fakeTreeDeps, sampleTree, treeOutput } from '../support/tree-deps'

const RUNS = { numRuns: 100 }

/** Mostly ordinary ids, plus empty, padded, long, control and cookieless values. */
const arbHeader: fc.Arbitrary<string | undefined> = fc.oneof(
  fc.constant(undefined),
  fc.stringMatching(/^[A-Za-z0-9-]{1,60}$/),
  fc.string({ maxLength: 260 }),
  fc.string({ maxLength: 20 }).map((s) => ` ${s}\n`),
  fc.constantFrom('', '   ', '$posthog_cookieless', 'a'.repeat(ANALYTICS_ID_MAX + 1)),
)

function usable(id: string): boolean {
  return id.length >= 1 && id.length <= ANALYTICS_ID_MAX && id === id.trim() && ![...id].some((c) => c.charCodeAt(0) <= 0x1f || c.charCodeAt(0) === 0x7f)
}

describe('Property 6: Server identity', () => {
  it('readAnalyticsIdentity returns null or ids of 1 to 200 characters with no control character', () => {
    fc.assert(
      fc.property(arbHeader, arbHeader, (distinctId, sessionId) => {
        const identity = readAnalyticsIdentity({ distinctId, sessionId })
        if (identity === null) return
        expect(usable(identity.distinctId)).toBe(true)
        expect(identity.distinctId).not.toBe('$posthog_cookieless')
        if (identity.sessionId !== undefined) expect(usable(identity.sessionId)).toBe(true)
      }),
      RUNS,
    )
  })

  it('the tree handler uses the browser id when there is one, else the user id', async () => {
    await fc.assert(
      fc.asyncProperty(arbHeader, arbHeader, async (distinctId, sessionId) => {
        const analytics = readAnalyticsIdentity({ distinctId, sessionId })
        const seen: (string | undefined)[] = []
        const recorded: AnalyticsIdentity[] = []
        const fake = fakeTreeDeps({
          adapterResult: () => {
            seen.push(currentAiObservabilityContext()?.distinctId)
            return treeOutput(sampleTree())
          },
        })
        fake.deps.recordGenerated = async ({ identity }) => {
          recorded.push(identity)
        }
        const response = await handleTreeRequest(
          { body: { hobby: 'guitar' }, headerKey: undefined, authorization: bearer(TOKEN), analytics },
          fake.deps,
        )

        const expected = analytics?.distinctId ?? USER_ID
        expect(response.status).toBe(200)
        expect(seen).toEqual([expected])
        expect(recorded.map((identity) => identity.distinctId)).toEqual([expected])
        expect(fake.calls.consume).toEqual([USER_ID])
      }),
      RUNS,
    )
  })
})
