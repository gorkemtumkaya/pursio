import { ref } from 'vue'
import { bearerHeader } from '#shared/utils/auth'
import { clearActiveHobbyId, clearSavePromptDismissed } from '~/utils/active-hobby'
import { AUTH_MESSAGES } from '~/utils/auth-logic'

/** Client-side limit of the delete request (Req 11.12). */
const DELETE_TIMEOUT_MS = 15_000

/**
 * "Log out" and "Delete my account" (spec: accounts-cloud-save, Req 11), shared
 * by the Profile_Page and the Settings_Page. The page shows the confirmation
 * with `AccountDeleteDialog`.
 */
export function useAccountActions() {
  const auth = useAuth()
  const router = useRouter()

  const logoutBusy = ref(false)
  const logoutError = ref<string | null>(null)

  /** A failure changes nothing and shows a message (Req 11.16). */
  async function logOut(): Promise<void> {
    if (logoutBusy.value) return
    logoutBusy.value = true
    logoutError.value = null
    const done = await auth.logout()
    logoutBusy.value = false
    if (!done) logoutError.value = AUTH_MESSAGES.logoutFailed
  }

  const deleteOpen = ref(false)
  const deleteBusy = ref(false)
  const deleteError = ref<string | null>(null)

  function askDelete(): void {
    deleteError.value = null
    deleteOpen.value = true
  }

  function cancelDelete(): void {
    deleteOpen.value = false
  }

  async function requestDelete(): Promise<boolean> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), DELETE_TIMEOUT_MS)
    try {
      const token = await auth.accessToken()
      if (token === null) return false
      const response = await $fetch<unknown>('/api/account', {
        method: 'DELETE',
        headers: bearerHeader(token),
        signal: controller.signal,
        retry: 0,
      })
      return typeof response === 'object' && response !== null && (response as Record<string, unknown>).ok === true
    } catch {
      return false
    } finally {
      clearTimeout(timer)
    }
  }

  /** One request per confirmation; a failure keeps the dialog open and changes nothing (Req 11.12, 11.15). */
  async function confirmDelete(): Promise<void> {
    if (deleteBusy.value) return
    deleteBusy.value = true
    deleteError.value = null
    if (!(await requestDelete())) {
      deleteError.value = AUTH_MESSAGES.deleteFailed
      deleteBusy.value = false
      return
    }
    await auth.endSessionAfterDelete()
    clearActiveHobbyId()
    clearSavePromptDismissed()
    deleteOpen.value = false
    deleteBusy.value = false
    await router.push('/')
  }

  return { logoutBusy, logoutError, logOut, deleteOpen, deleteBusy, deleteError, askDelete, cancelDelete, confirmDelete }
}
