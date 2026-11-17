import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import type { SkillVideosParams } from '~/composables/useSkillVideos'

// The composable only needs a token and the request loop; both are faked here.
const { runVideosLoop } = vi.hoisted(() => ({ runVideosLoop: vi.fn(async () => {}) }))
vi.mock('~/utils/video-api', () => ({ fetchVideos: vi.fn(), runVideosLoop }))

const params = (overrides: Partial<SkillVideosParams> = {}): SkillVideosParams => ({
  hobby: 'Bouldering',
  skillTitle: 'Footwork basics',
  level: 'beginner',
  language: 'en',
  pathId: 'path-1',
  skillId: 'skill-1',
  ...overrides,
})

/** Lets the awaited token and the loop call settle. */
async function settle(): Promise<void> {
  await nextTick()
  await Promise.resolve()
  await Promise.resolve()
}

describe('useSkillVideos', () => {
  beforeEach(() => {
    runVideosLoop.mockClear()
    vi.stubGlobal('useAuth', () => ({ accessToken: async () => null }))
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  async function mount(initial: SkillVideosParams) {
    const { useSkillVideos } = await import('~/composables/useSkillVideos')
    const source = ref<SkillVideosParams | null>(initial)
    const scope = effectScope()
    const result = scope.run(() => useSkillVideos(source))!
    await settle()
    return { source, scope, state: result.state }
  }

  it('loads again when the skill changes', async () => {
    const { source, scope } = await mount(params())
    source.value = params({ skillTitle: 'Reading a route', skillId: 'skill-2' })
    await settle()
    expect(runVideosLoop).toHaveBeenCalledTimes(2)
    scope.stop()
  })

  // A quest tick rebuilds the sheet's detail, so PathView hands over a new but equal params object.
  it('keeps the videos when equal params arrive (quest tick)', async () => {
    const { source, scope, state } = await mount(params())
    state.value = { kind: 'ready', videos: [], language: 'en' }
    source.value = params()
    await settle()
    expect(runVideosLoop).toHaveBeenCalledTimes(1)
    expect(state.value.kind).toBe('ready')
    scope.stop()
  })

  it('loads again when the language changes', async () => {
    const { source, scope } = await mount(params())
    source.value = params({ language: 'tr' })
    await settle()
    expect(runVideosLoop).toHaveBeenCalledTimes(2)
    scope.stop()
  })

  it('hides on close and loads again when the same skill reopens', async () => {
    const { source, scope, state } = await mount(params())
    source.value = null
    await settle()
    expect(state.value.kind).toBe('hidden')
    source.value = params()
    await settle()
    expect(runVideosLoop).toHaveBeenCalledTimes(2)
    scope.stop()
  })
})
