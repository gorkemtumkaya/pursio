import { handleDeleteAccount } from '../utils/account-handlers'
import { accountDeleteDeps } from '../utils/account-runtime'

/** Delete_Route. Only the Authorization header is read; the URL and body are ignored. */
export default defineEventHandler(async (event) => {
  const authorization = getHeader(event, 'authorization')
  const result = await handleDeleteAccount({ authorization }, accountDeleteDeps())
  setResponseStatus(event, result.status)
  return result.body
})
