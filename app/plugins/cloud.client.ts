import { watch } from 'vue'

/**
 * Keeps the Cloud_Store in step with the session (spec: accounts-cloud-save):
 * a user id loads that user's rows, no user id clears them. In Demo_Mode no
 * session starts, so this never sends a request there.
 */
export default defineNuxtPlugin(() => {
  const { userId } = useAuth()
  const cloud = useCloudStore()

  watch(
    userId,
    (id) => {
      if (id !== '') void cloud.bootstrap(id)
      else cloud.clear()
    },
    { immediate: true },
  )
})
