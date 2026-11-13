import { readonly } from 'vue'
import type { AuthMode } from '~/utils/auth-logic'

/** `prompt` is the Save_Prompt shown after a completion; `plain` is opened by a link or button. */
export type AuthDialogVariant = 'prompt' | 'plain'

export interface AuthDialogState {
  open: boolean
  mode: AuthMode
  variant: AuthDialogVariant
  /** Message shown when the dialog opens, e.g. after a failed sign-in callback. */
  error: string | null
}

/** The one app-wide Auth_Dialog, rendered by `AuthDialog` in `app.vue`. */
export function useAuthDialog() {
  const state = useState<AuthDialogState>('pursio-auth-dialog', () => ({
    open: false,
    mode: 'save',
    variant: 'plain',
    error: null,
  }))

  function show(mode: AuthMode, variant: AuthDialogVariant = 'plain', error: string | null = null): void {
    state.value = { open: true, mode, variant, error }
  }

  /** Keeps mode and variant, so the leave transition shows no other text. */
  function close(): void {
    if (state.value.open) state.value = { ...state.value, open: false }
  }

  return { state: readonly(state), show, close }
}
