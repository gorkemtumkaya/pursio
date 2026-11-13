import { KEY_HEADER } from '../../shared/utils/llm'
import { handleTreeRequest } from '../utils/llm-handlers'
import { llmTreeDeps } from '../utils/llm-runtime'

export default defineEventHandler(async (event) => {
  const body: unknown = await readBody(event).catch(() => null)
  const headerKey = getHeader(event, KEY_HEADER)
  const authorization = getHeader(event, 'authorization')
  const result = await handleTreeRequest({ body, headerKey, authorization }, llmTreeDeps())
  setResponseStatus(event, result.status)
  return result.body
})
