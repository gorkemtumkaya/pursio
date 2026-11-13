import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { computed } from 'vue'
import { clearActiveHobbyId } from '~/utils/active-hobby'
import {
  CALLBACK_ERROR_PARAMS,
  authFailureMessage,
  callbackFailure,
  classifyAuthError,
  isValidEmail,
  sessionView,
  type AuthFailure,
  type AuthMode,
  type SessionStatus,
  type SessionUser,
} from '~/utils/auth-logic'
import { raceDeadline } from '~/utils/deadline'
import { getSupabase } from '~/utils/supabase-client'

interface AuthState {
  status: SessionStatus
  user: SessionUser | null
}

export type EmailResult = 'sent' | 'invalid' | AuthFailure

/** Limit for starting a session and for each sign-in request (Req 3.5, 4.13). */
const DEADLINE_MS = 10_000

// One Supabase_Client and one session start per page load, shared by every caller.
let client: SupabaseClient | null = null
let inflight: Promise<void> | null = null
/** True once a session was applied; `ensure()` is then a no-op. */
let started = false
let subscribed = false
/** True while this module ends the session itself, so the listener stays out of the way. */
let endingSession = false
let hydrated: Promise<void> | null = null

const LOADING: AuthState = { status: 'loading', user: null }

/**
 * Auth_Service (spec: accounts-cloud-save, Req 3, 4, 11). Every visitor outside
 * Demo_Mode gets a session: a stored one is reused, else an anonymous user is
 * created. Signing up links Google or an email to that same user.
 *
 * The client is only built by `ensure()`, which the global middleware skips in
 * Demo_Mode, so the demo makes no Supabase request and leaves a stored session
 * untouched (Req 12.1, 12.4).
 */
export function useAuth() {
  const state = useState<AuthState>('pursio-auth', () => ({ ...LOADING }))
  const config = useRuntimeConfig()
  const router = useRouter()
  const toast = useToast()
  const dialog = useAuthDialog()

  // The session starts after hydration, so the first client render matches the server's loading state.
  if (import.meta.client) hydrated ??= new Promise<void>((resolve) => onNuxtReady(() => resolve()))

  const view = computed(() => sessionView(state.value.status, state.value.user))
  const status = computed(() => view.value.status)
  const userId = computed(() => view.value.userId)
  const isAnonymous = computed(() => view.value.isAnonymous)
  const email = computed(() => view.value.email)

  function apply(session: Session): void {
    const { user } = session
    const isAnon = user.is_anonymous === true
    state.value = {
      status: isAnon ? 'anonymous' : 'signed_in',
      user: { id: user.id, email: user.email ?? '', isAnonymous: isAnon },
    }
  }

  function subscribe(supabase: SupabaseClient): void {
    if (subscribed) return
    subscribed = true
    supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        // Our own sign-outs are followed up by the code that made them.
        if (inflight || endingSession) return
        started = false
        state.value = { ...LOADING }
        // Supabase calls must not be awaited inside this callback; start the new session afterwards.
        setTimeout(() => void ensure(), 0)
        return
      }
      if (session && (event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'TOKEN_REFRESHED')) {
        apply(session)
      }
    })
  }

  /** Removes a failed callback's parameters from the address bar. */
  function stripCallbackError(): void {
    const url = new URL(window.location.href)
    for (const name of CALLBACK_ERROR_PARAMS) url.searchParams.delete(name)
    const hash = new URLSearchParams(url.hash.replace(/^#/, ''))
    if (CALLBACK_ERROR_PARAMS.some((name) => hash.has(name))) url.hash = ''
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
  }

  function reportCallbackFailure(failure: AuthFailure): void {
    const message = authFailureMessage(failure)
    if (failure === 'account_exists' && state.value.status === 'anonymous') dialog.show('save', 'plain', message)
    else toast.show(message)
  }

  async function start(): Promise<void> {
    await hydrated
    // Read and remove a failed callback before the client sees the URL, so the stored session is kept (Req 4.5, 4.9).
    const failure = callbackFailure(window.location.href)
    if (failure) stripCallbackError()

    const url = typeof config.public.supabaseUrl === 'string' ? config.public.supabaseUrl.trim() : ''
    const anonKey = typeof config.public.supabaseAnonKey === 'string' ? config.public.supabaseAnonKey.trim() : ''
    const supabase = await getSupabase(url, anonKey)
    if (!supabase) throw new Error('unavailable')
    client = supabase
    subscribe(supabase)

    // Refreshes an expired session; one that cannot be refreshed comes back as none (Req 3.8).
    const { data } = await supabase.auth.getSession()
    let session = data.session
    if (!session) {
      try {
        await supabase.auth.signOut({ scope: 'local' })
      } catch {
        // Nothing stored, or it could not be removed: the new session replaces it.
      }
      const created = await supabase.auth.signInAnonymously()
      if (created.error || !created.data.session) throw new Error('unavailable')
      session = created.data.session
    }
    apply(session)
    started = true
    if (failure) reportCallbackFailure(failure)
  }

  /** Makes sure a session exists. Safe to call often: one start runs at a time. */
  function ensure(): Promise<void> {
    if (!import.meta.client) return Promise.resolve()
    if (inflight) return inflight
    if (started) return Promise.resolve()
    state.value = { ...LOADING }
    const run: Promise<void> = raceDeadline(start(), DEADLINE_MS)
      .catch(() => {
        if (!started) state.value = { status: 'unavailable', user: null }
      })
      .finally(() => {
        if (inflight === run) inflight = null
      })
    inflight = run
    return run
  }

  /** "Try again" after `unavailable` (Req 3.7). */
  function retry(): Promise<void> {
    started = false
    return ensure()
  }

  /** The current Access_Token, refreshed by the library when due, or `null`. */
  async function accessToken(): Promise<string | null> {
    if (!client) return null
    try {
      const { data } = await client.auth.getSession()
      return data.session?.access_token ?? null
    } catch {
      return null
    }
  }

  /**
   * Starts the Google flow, which leaves the page. `save` links Google to the
   * current user, so the user id stays (Req 4.1); `login` signs in to the
   * account of that Google identity (Req 4.6). Returns `null` while the browser
   * is redirecting, else why it failed.
   */
  async function startGoogle(mode: AuthMode): Promise<AuthFailure | null> {
    if (!client) return 'failed'
    const { origin, pathname, search } = window.location
    try {
      const request: Promise<{ error: unknown }> =
        mode === 'save'
          ? client.auth.linkIdentity({ provider: 'google', options: { redirectTo: `${origin}${pathname}${search}` } })
          : client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${origin}/` } })
      const { error } = await raceDeadline(request, DEADLINE_MS)
      return error ? classifyAuthError(error) : null
    } catch (error) {
      return classifyAuthError(error)
    }
  }

  /**
   * Sends a magic link. `save` adds the email to the current anonymous user;
   * `login` only signs in to an existing account and never creates one. An
   * invalid address sends nothing. The session is never touched on failure.
   */
  async function sendEmail(mode: AuthMode, raw: string): Promise<EmailResult> {
    if (!isValidEmail(raw)) return 'invalid'
    if (!client) return 'failed'
    const address = raw.trim()
    const { origin, pathname, search } = window.location
    try {
      const request: Promise<{ error: unknown }> =
        mode === 'save'
          ? client.auth.updateUser({ email: address }, { emailRedirectTo: `${origin}${pathname}${search}` })
          : client.auth.signInWithOtp({
              email: address,
              options: { shouldCreateUser: false, emailRedirectTo: `${origin}/` },
            })
      const { error } = await raceDeadline(request, DEADLINE_MS)
      return error ? classifyAuthError(error) : 'sent'
    } catch (error) {
      return classifyAuthError(error)
    }
  }

  /** Signs out on this device only. Returns true when the session ended. */
  async function signOutLocal(): Promise<boolean> {
    if (!client) return false
    endingSession = true
    try {
      const { error } = await client.auth.signOut({ scope: 'local' })
      return !error
    } catch {
      return false
    } finally {
      endingSession = false
    }
  }

  /**
   * Log out (Req 11.5): ends the session on this device, forgets the
   * Active_Hobby and opens `/`, where a new anonymous session starts. Returns
   * false, with nothing changed, when the session could not be ended (Req 11.16).
   */
  async function logout(): Promise<boolean> {
    if (!(await signOutLocal())) return false
    clearActiveHobbyId()
    started = false
    state.value = { ...LOADING }
    await router.push('/')
    void ensure()
    return true
  }

  /**
   * After the account was deleted (Req 11.13): the session ends on this device
   * even when the sign-out call fails. A stored value that survives belongs to
   * a deleted user, cannot be refreshed and is replaced on a later load.
   */
  async function endSessionAfterDelete(): Promise<void> {
    await signOutLocal()
    started = false
    state.value = { ...LOADING }
  }

  return {
    status,
    userId,
    isAnonymous,
    email,
    ensure,
    retry,
    accessToken,
    startGoogle,
    sendEmail,
    logout,
    endSessionAfterDelete,
    /** The Supabase_Client once a session start has built it, else `null`. */
    client: (): SupabaseClient | null => client,
  }
}
