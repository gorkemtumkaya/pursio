// Fresh navigation item (spec: fresh, task 15.3; Req 10.1 to 10.4, 10.6, 10.8).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ICON_NAMES, ICONS } from '../../app/utils/icons'
import { navItems } from '../../app/utils/nav-items'

const NAV_SOURCE = readFileSync(new URL('../../app/components/path/PathNavItems.vue', import.meta.url), 'utf8')
const PATH_PAGE = readFileSync(new URL('../../app/pages/path.vue', import.meta.url), 'utf8')

describe('navItems', () => {
  it('places Fresh directly between Path and Quests, in both variants (Req 10.1, 10.2, 10.5)', () => {
    for (const variant of ['bottom', 'side'] as const) {
      expect(navItems('/path', false, variant).map((i) => i.key)).toEqual(['path', 'fresh', 'quests', 'profile'])
    }
  })

  it('has the accessible name "Fresh", the spark icon and links to /fresh (Req 10.1, 10.8)', () => {
    const fresh = navItems('/path', false, 'side').find((i) => i.key === 'fresh')
    expect(fresh).toMatchObject({ label: 'Fresh', icon: 'spark', to: '/fresh' })
  })

  it('marks only Fresh as the current page on /fresh (Req 10.3)', () => {
    for (const variant of ['bottom', 'side'] as const) {
      for (const demo of [false, true]) {
        const items = navItems('/fresh', demo, variant)
        expect(items.filter((i) => i.current !== undefined).map((i) => i.key)).toEqual(['fresh'])
        expect(items.filter((i) => i.active).map((i) => i.key)).toEqual(['fresh'])
        expect(items.find((i) => i.key === 'fresh')?.current).toBe('page')
      }
    }
  })

  it('keeps the other pages marked as before', () => {
    expect(navItems('/path', false, 'side').find((i) => i.current)?.key).toBe('path')
    expect(navItems('/quests', false, 'side').find((i) => i.current)?.key).toBe('quests')
    expect(navItems('/profile', false, 'side').find((i) => i.current)?.key).toBe('profile')
    expect(navItems('/settings', false, 'side').find((i) => i.current)).toBeUndefined()
    expect(navItems('/settings', false, 'bottom').find((i) => i.key === 'profile')?.current).toBe('true')
  })

  it('in Demo_Mode shows Path and Fresh only, both keeping the demo (Req 10.4)', () => {
    const items = navItems('/fresh', true, 'bottom')
    expect(items.map((i) => [i.key, i.to])).toEqual([
      ['path', '/path?demo=1'],
      ['fresh', '/fresh?demo=1'],
    ])
  })
})

describe('PathNavItems.vue', () => {
  it('uses w-22 bottom items with 44px targets, so 4 items fit 390px (Req 10.6)', () => {
    expect(NAV_SOURCE).toContain("'w-22'")
    expect(NAV_SOURCE).not.toContain('w-28')
    expect(NAV_SOURCE).toContain('min-h-11')
    expect(NAV_SOURCE).toContain('min-w-11')
    expect(4 * 88).toBeLessThanOrEqual(390 - 2 * 8)
  })

  it('renders every item, Fresh included, as a NuxtLink with the shared focus outline (Req 10.7, 10.8)', () => {
    expect(NAV_SOURCE).toMatch(/v-for="item in items"/)
    expect(NAV_SOURCE).toContain('<NuxtLink')
    expect(NAV_SOURCE).toContain('focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink')
    expect(NAV_SOURCE).toContain('{{ item.label }}')
  })

  it('the spark icon is part of the icon set', () => {
    expect(ICON_NAMES).toContain('spark')
    expect(ICONS.spark.filled).toBe(false)
    expect(ICONS.spark.shapes.length).toBeGreaterThan(0)
  })
})

describe('path page (Req 3.10, 13.4)', () => {
  it('passes the skill query to PathView and touches the opened cloud path', () => {
    expect(PATH_PAGE).toContain('route.query.skill')
    expect(PATH_PAGE.match(/:initial-skill-id="initialSkillId"/g)).toHaveLength(2)
    expect(PATH_PAGE).toContain('touchPathOpened(')
  })
})
