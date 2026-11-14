import { DRAIN_SECRET_HEADER, handleDrainRequest } from '../../utils/video/handlers'
import { drainDeps } from '../../utils/video/runtime'

export default defineEventHandler(async (event) => {
  const { secret, scheduler, log } = drainDeps()
  const secretHeader = getHeader(event, DRAIN_SECRET_HEADER)
  // Without a scheduler there is nothing to run; the handler still checks the secret first.
  const result = await handleDrainRequest(
    { secretHeader },
    { secret, scheduler: scheduler ?? { drainDue: () => Promise.resolve(0) }, log },
  )
  setResponseStatus(event, result.status)
  return result.body
})
