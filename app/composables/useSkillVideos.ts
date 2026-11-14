import { onScopeDispose, ref, watch, type Ref } from 'vue'
import type { Level } from '#shared/types/skill-tree'
import type { SkillVideosState } from '#shared/types/video'
import { fetchVideos, runVideosLoop } from '~/utils/video-api'

/** The skill whose videos the sheet shows. `pathId` and `skillId` are set for a signed-in user. */
export interface SkillVideosParams {
  hobby: string
  skillTitle: string
  level: Level
  /** Language from user settings; null or empty means `en`. */
  language: string | null
  pathId?: string
  skillId?: string
}

/**
 * Videos for one skill (spec: skill-video-pipeline, Req 12.7 to 12.10, 12.16, 12.17).
 * Pass `null` while the sheet is closed. A new value, or `null`, stops any request and poll in flight.
 * With a session the request carries the token; while a fill runs it polls every 5 s, up to 24 times.
 * A failed request hides the section and never blocks the sheet.
 */
export function useSkillVideos(params: Ref<SkillVideosParams | null>) {
  const auth = useAuth()
  const state = ref<SkillVideosState>({ kind: 'hidden' })
  let run = 0
  let controller: AbortController | null = null

  function stop(): void {
    run += 1
    controller?.abort()
    controller = null
  }

  async function load(current: SkillVideosParams): Promise<void> {
    stop()
    const mine = run
    const abort = new AbortController()
    controller = abort
    state.value = { kind: 'hidden' }
    const token = await auth.accessToken()
    if (mine !== run) return
    const signedIn = token !== null
    await runVideosLoop(
      { language: current.language, signedIn },
      {
        fetchOnce: () =>
          fetchVideos(
            {
              hobby: current.hobby,
              skillTitle: current.skillTitle,
              level: current.level,
              language: current.language,
              pathId: current.pathId,
              skillId: current.skillId,
            },
            token,
            abort.signal,
          ),
        sleep: (ms) =>
          new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, ms)
            abort.signal.addEventListener('abort', () => {
              clearTimeout(timer)
              resolve()
            })
          }),
        cancelled: () => mine !== run,
        onState: (next) => {
          state.value = next
        },
      },
    )
  }

  watch(
    params,
    (next) => {
      if (next === null) {
        stop()
        state.value = { kind: 'hidden' }
        return
      }
      void load(next)
    },
    { immediate: true, deep: true },
  )

  onScopeDispose(stop)

  return { state }
}
