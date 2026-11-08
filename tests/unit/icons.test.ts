import { describe, expect, it } from 'vitest'
import { ICON_NAMES, ICONS, isIconName } from '~/utils/icons'

describe('icon set', () => {
  it('defines at least one shape for every icon name', () => {
    expect(ICON_NAMES).toHaveLength(17)
    for (const name of ICON_NAMES) {
      expect(ICONS[name].shapes.length).toBeGreaterThan(0)
    }
    expect(Object.keys(ICONS).sort()).toEqual([...ICON_NAMES].sort())
  })

  it('uses well-formed paths with no hardcoded color values', () => {
    for (const name of ICON_NAMES) {
      for (const shape of ICONS[name].shapes) {
        const serialized = JSON.stringify(shape)
        expect(serialized).not.toMatch(/#[0-9a-f]{3,8}\b|rgb|hsl|oklch/i)
        if (shape.tag === 'path') expect(shape.d).toMatch(/^M/)
      }
    }
  })

  it('narrows icon names', () => {
    expect(isIconName('trophy')).toBe(true)
    expect(isIconName('rocket')).toBe(false)
    expect(isIconName(3)).toBe(false)
  })
})
