import { KEY_HEADER } from '../../shared/utils/llm'
import { DISTINCT_ID_HEADER, SESSION_ID_HEADER } from '../../shared/utils/analytics-identity'
import { readAnalyticsIdentity } from '../utils/analytics-events'
import { handleIntakeRequest } from '../utils/intake-handlers'
import { intakeDeps } from '../utils/intake-runtime'

/** Reads a learner's Note into a Learner_Profile (spec: path-intake, Requirement 2). */
export default defineEventHandler(async (event) => {
  const body: unknown = await readBody(event).catch(() => null)
  const headerKey = getHeader(event, KEY_HEADER)
  const authorization = getHeader(event, 'authorization')
  // Analytics only (spec: sample-path, Req 12.2, 12.5).
  const analytics = readAnalyticsIdentity({
    distinctId: getHeader(event, DISTINCT_ID_HEADER),
    sessionId: getHeader(event, SESSION_ID_HEADER),
  })
  const result = await handleIntakeRequest({ body, headerKey, authorization, analytics }, intakeDeps())
  setResponseStatus(event, result.status)
  return result.body
})
