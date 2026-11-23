import { KEY_HEADER } from '../../shared/utils/llm'
import { DISTINCT_ID_HEADER, SESSION_ID_HEADER } from '../../shared/utils/analytics-identity'
import { readAnalyticsIdentity } from '../utils/analytics-events'
import { handleTreeRequest } from '../utils/llm-handlers'
import { logSkillPathRequest } from '../utils/posthog-logs'
import { llmTreeDeps } from '../utils/llm-runtime'

export default defineEventHandler(async (event) => {
  const body: unknown = await readBody(event).catch(() => null)
  const headerKey = getHeader(event, KEY_HEADER)
  const authorization = getHeader(event, 'authorization')
  // Analytics only (spec: sample-path, Req 12.2, 12.5).
  const analytics = readAnalyticsIdentity({
    distinctId: getHeader(event, DISTINCT_ID_HEADER),
    sessionId: getHeader(event, SESSION_ID_HEADER),
  })
  const result = await handleTreeRequest({ body, headerKey, authorization, analytics }, llmTreeDeps())
  await logSkillPathRequest(result.status)
  setResponseStatus(event, result.status)
  return result.body
})
