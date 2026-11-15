// Feature: fresh, Property 23: Fresh_Endpoint is read-only and validates its body
// For any signed-in or signed-out request, valid or invalid, the endpoint makes 0 provider,
// model, feed or fill calls and 0 store writes; for any signed-out body with one defect the
// response is 400 invalid_input naming the field of that defect, with no data read; and a body
// whose language is missing, null, empty or whitespace, or whose paths have
// `currentSkillId: null`, is accepted.
// Validates: Requirements 3.11, 8.2, 8.3, 8.6
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { Level } from '../../shared/types/skill-tree'
import { handleFreshRequest } from '../../server/utils/fresh/handlers'
import { createFreshEndpointHarness, userData, userPath } from '../support/fresh-route-fakes'

const LEVELS: readonly Level[] = ['beginner', 'intermediate', 'advanced']
const ALLOWED_DEPS = ['verifyToken', 'verifyTimeoutMs', 'limiter', 'store', 'loadUserData', 'loadTimeoutMs', 'now', 'log']

interface BodySkill { id: string; title: string; level: string }
interface BodyPath { id: string; hobby: string; skills: BodySkill[]; currentSkillId: string | null }
interface Body { language?: string | null; paths: BodyPath[] }

const textArb = (max: number) =>
  fc.string({ unit: 'grapheme-ascii', minLength: 1, maxLength: max }).filter((t) => t.trim().length >= 1)

const pathArb = (i: number): fc.Arbitrary<BodyPath> =>
  fc
    .record({
      hobby: textArb(100),
      skills: fc.array(fc.record({ title: textArb(100), level: fc.constantFrom(...LEVELS) }), { minLength: 1, maxLength: 5 }),
      current: fc.option(fc.nat(), { nil: null }),
    })
    .map(({ hobby, skills, current }) => {
      const withIds = skills.map((s, j) => ({ id: `s${i}-${j}`, title: s.title, level: s.level }))
      return {
        id: `p${i}`,
        hobby,
        skills: withIds,
        currentSkillId: current === null ? null : withIds[current % withIds.length]!.id,
      }
    })

const languageArb = fc.constantFrom<string | null | undefined>(undefined, null, '', ' ', '\t', 'en', 'de', 'pt-BR')

const validBodyArb: fc.Arbitrary<Body> = fc
  .tuple(languageArb, fc.integer({ min: 0, max: 10 }))
  .chain(([language, n]) =>
    fc.tuple(...Array.from({ length: n }, (_v, i) => pathArb(i))).map((paths): Body => {
      const body: Body = { paths }
      if (language !== undefined) body.language = language
      return body
    }),
  )

type Defect =
  | { kind: 'too_many_paths' }
  | { kind: 'too_many_skills' | 'empty_id' | 'empty_hobby' | 'long_hobby' | 'bad_current'; at: number }
  | { kind: 'empty_skill_id' | 'empty_title' | 'long_title' | 'bad_level'; at: number; skill: number }

function applyDefect(body: Body, defect: Defect): { body: Body; field: string } {
  const copy: Body = structuredClone(body)
  if (defect.kind === 'too_many_paths') {
    while (copy.paths.length <= 10) copy.paths.push({ id: `x${copy.paths.length}`, hobby: 'h', skills: [{ id: 'k', title: 't', level: 'beginner' }], currentSkillId: null })
    return { body: copy, field: 'paths' }
  }
  const i = defect.at % copy.paths.length
  const path = copy.paths[i]!
  const at = `paths.${i}`
  switch (defect.kind) {
    case 'too_many_skills':
      while (path.skills.length <= 200) path.skills.push({ id: `extra${path.skills.length}`, title: 'x', level: 'beginner' })
      return { body: copy, field: `${at}.skills` }
    case 'empty_id':
      path.id = '  '
      return { body: copy, field: `${at}.id` }
    case 'empty_hobby':
      path.hobby = ''
      return { body: copy, field: `${at}.hobby` }
    case 'long_hobby':
      path.hobby = 'h'.repeat(101)
      return { body: copy, field: `${at}.hobby` }
    case 'bad_current':
      path.currentSkillId = 'not-a-skill-id'
      return { body: copy, field: `${at}.currentSkillId` }
    default: {
      const j = defect.skill % path.skills.length
      const skill = path.skills[j]!
      const sat = `${at}.skills.${j}`
      if (defect.kind === 'empty_skill_id') skill.id = ''
      if (defect.kind === 'empty_title') skill.title = ' '
      if (defect.kind === 'long_title') skill.title = 't'.repeat(101)
      if (defect.kind === 'bad_level') skill.level = 'expert'
      const suffix = defect.kind === 'empty_skill_id' ? 'id' : defect.kind === 'bad_level' ? 'level' : 'title'
      return { body: copy, field: `${sat}.${suffix}` }
    }
  }
}

const defectArb: fc.Arbitrary<Defect> = fc.oneof(
  fc.constant<Defect>({ kind: 'too_many_paths' }),
  fc.record({
    kind: fc.constantFrom('too_many_skills', 'empty_id', 'empty_hobby', 'long_hobby', 'bad_current') as fc.Arbitrary<
      'too_many_skills' | 'empty_id' | 'empty_hobby' | 'long_hobby' | 'bad_current'
    >,
    at: fc.nat(),
  }),
  fc.record({
    kind: fc.constantFrom('empty_skill_id', 'empty_title', 'long_title', 'bad_level') as fc.Arbitrary<
      'empty_skill_id' | 'empty_title' | 'long_title' | 'bad_level'
    >,
    at: fc.nat(),
    skill: fc.nat(),
  }),
)

const WRITES = ['cleanup', 'takeLease', 'releaseLease', 'storeCheck']

describe('Property 23: Fresh_Endpoint is read-only and validates its body', () => {
  it('has no provider, feed, model, scheduler or check dependency', () => {
    const h = createFreshEndpointHarness()
    for (const key of Object.keys(h.deps)) expect(ALLOWED_DEPS).toContain(key)
    expect(Object.keys(h.deps.store)).toEqual(['readPage'])
  })

  it('accepts every valid signed-out body (missing language and null current Skill included) with one read', async () => {
    await fc.assert(
      fc.asyncProperty(validBodyArb, async (body) => {
        const h = createFreshEndpointHarness()
        const result = await handleFreshRequest({ body, authorization: undefined, clientIp: '203.0.113.9' }, h.deps)
        expect(result.status).toBe(200)
        expect('error' in result.body).toBe(false)
        expect(h.reads).toHaveLength(body.paths.length === 0 ? 0 : 1)
        expect(h.storeCalls.filter((c) => WRITES.includes(c))).toEqual([])
        expect(h.userLoads).toEqual([])
        expect(h.limiterKeys).toEqual(['ip:203.0.113.9'])
      }),
      { numRuns: 150 },
    )
  })

  it('rejects a body with one defect with 400 and the field of that defect, reading nothing', async () => {
    await fc.assert(
      fc.asyncProperty(
        validBodyArb.filter((b) => b.paths.length > 0),
        defectArb,
        async (valid, defect) => {
          const { body, field } = applyDefect(valid, defect)
          const h = createFreshEndpointHarness()
          const result = await handleFreshRequest({ body, authorization: undefined, clientIp: '203.0.113.9' }, h.deps)
          expect(result).toEqual({ status: 400, body: { error: 'invalid_input', field } })
          expect(h.reads).toEqual([])
          expect(h.storeCalls).toEqual([])
          expect(h.limiterKeys).toEqual([])
        },
      ),
      { numRuns: 200 },
    )
  })

  it('rejects a non-object body and a non-string language', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.constantFrom(null, 'text', 42, true, [] as unknown[]).map((body) => ({ body, field: 'body' })),
          fc.constantFrom(1, true, {}, ['en']).map((language) => ({ body: { language, paths: [] }, field: 'language' })),
          fc.constantFrom(undefined, null, 'x', {}).map((paths) => ({ body: { paths }, field: 'paths' })),
        ),
        async ({ body, field }) => {
          const h = createFreshEndpointHarness()
          const result = await handleFreshRequest({ body, authorization: undefined, clientIp: undefined }, h.deps)
          expect(result).toEqual({ status: 400, body: { error: 'invalid_input', field } })
          expect(h.reads).toEqual([])
        },
      ),
      { numRuns: 100 },
    )
  })

  it('signed-in requests ignore the body and only read', async () => {
    await fc.assert(
      fc.asyncProperty(validBodyArb, fc.anything(), async (shape, body) => {
        const paths = shape.paths.map((p) =>
          userPath({ id: p.id, hobby: p.hobby, skills: p.skills.map((s) => ({ ...s, level: s.level as Level })), currentSkillId: p.currentSkillId }),
        )
        const h = createFreshEndpointHarness({
          users: { 'good-token': { userId: 'user-1', data: userData(shape.language ?? 'en', paths) } },
        })
        const result = await handleFreshRequest({ body, authorization: 'Bearer good-token', clientIp: '203.0.113.9' }, h.deps)
        expect(result.status).toBe(200)
        expect(h.userLoads).toEqual(['good-token'])
        expect(h.reads).toHaveLength(paths.length === 0 ? 0 : 1)
        expect(h.storeCalls.filter((c) => WRITES.includes(c))).toEqual([])
        expect(h.limiterKeys).toEqual(['user:user-1'])
      }),
      { numRuns: 100 },
    )
  })
})
