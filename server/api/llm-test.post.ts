import { KEY_HEADER } from '../../shared/utils/llm'
import { handleTestRequest } from '../utils/llm-handlers'
import { llmTestDeps } from '../utils/llm-runtime'

export default defineEventHandler(async (event) => {
  const body: unknown = await readBody(event).catch(() => null)
  const headerKey = getHeader(event, KEY_HEADER)
  const result = await handleTestRequest({ body, headerKey }, llmTestDeps())
  setResponseStatus(event, result.status)
  return result.body
})
