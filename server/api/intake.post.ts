import { KEY_HEADER } from '../../shared/utils/llm'
import { handleIntakeRequest } from '../utils/intake-handlers'
import { intakeDeps } from '../utils/intake-runtime'

/** Reads a learner's Note into a Learner_Profile (spec: path-intake, Requirement 2). */
export default defineEventHandler(async (event) => {
  const body: unknown = await readBody(event).catch(() => null)
  const headerKey = getHeader(event, KEY_HEADER)
  const authorization = getHeader(event, 'authorization')
  const result = await handleIntakeRequest({ body, headerKey, authorization }, intakeDeps())
  setResponseStatus(event, result.status)
  return result.body
})
