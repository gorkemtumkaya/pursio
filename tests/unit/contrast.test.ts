import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Requirement 13.9: text/background pairs used by the path view reach 4.5:1
// in every theme. Requirement 13.2: every theme defines the same tokens, so
// switching data-theme restyles everything without touching markup.

const THEME_NAMES = ['trail', 'boulder', 'halloween'] as const
type ThemeName = (typeof THEME_NAMES)[number]

const MIN_RATIO = 4.5

/** [text token, background token] pairs from the design's contrast list. */
const PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['ink', 'bg'],
  ['ink', 'surface'],
  ['ink', 'surface-2'],
  ['muted', 'bg'],
  ['muted', 'surface'],
  ['muted', 'surface-2'],
  ['accent-text', 'bg'],
  ['accent-text', 'surface'],
  ['accent-text', 'surface-2'],
  ['primary-ink', 'primary'],
  ['danger-ink', 'danger'],
  ['danger-text', 'bg'],
  ['danger-text', 'surface'],
  ['danger-text', 'surface-2'],
  ['done-ink', 'done'],
  ['banner-ink', 'banner'],
  ['banner-muted', 'banner'],
  ['bg', 'ink'],
]

const css = readFileSync(
  fileURLToPath(new URL('../../app/assets/css/themes.css', import.meta.url)),
  'utf8',
)

/** Splits themes.css into theme name -> { token name -> raw value }. */
function parseThemes(source: string): Map<ThemeName, Map<string, string>> {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '')
  const themes = new Map<ThemeName, Map<string, string>>()
  const blockPattern = /([^{}]+)\{([^{}]*)\}/g
  for (const block of withoutComments.matchAll(blockPattern)) {
    const selector = block[1] ?? ''
    const body = block[2] ?? ''
    const name = THEME_NAMES.find((theme) => selector.includes(`[data-theme="${theme}"]`))
    if (!name) continue
    const tokens = new Map<string, string>()
    for (const declaration of body.matchAll(/--pursio-([a-z0-9-]+)\s*:\s*([^;]+);/g)) {
      const token = declaration[1]
      const value = declaration[2]
      if (token && value) tokens.set(token, value.trim())
    }
    themes.set(name, tokens)
  }
  return themes
}

type Rgb = readonly [number, number, number]

/** Parses the opaque color formats used for text and backgrounds: #rgb, #rrggbb, rgb(). */
function parseColor(value: string): Rgb {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value)
  if (hex?.[1]) {
    const digits = hex[1].length === 3 ? [...hex[1]].map((d) => d + d).join('') : hex[1]
    return [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16)) as unknown as Rgb
  }
  const rgb = /^rgb\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)\s*\)$/i.exec(value)
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])]
  throw new Error(`Unsupported or non-opaque color for a contrast pair: ${value}`)
}

/** WCAG 2.x relative luminance. */
function luminance([r, g, b]: Rgb): number {
  const channel = (c: number): number => {
    const s = c / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function contrastRatio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

const themes = parseThemes(css)

describe('contrast helpers', () => {
  it('matches the WCAG reference values', () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5)
    expect(contrastRatio(parseColor('#777'), parseColor('#ffffff'))).toBeCloseTo(4.48, 2)
    expect(parseColor('rgb(1, 2, 3)')).toEqual([1, 2, 3])
  })
})

describe('themes.css', () => {
  it('defines a block for every theme', () => {
    expect([...themes.keys()].sort()).toEqual([...THEME_NAMES].sort())
  })

  it('defines the same --pursio-* tokens in every theme', () => {
    const reference = [...(themes.get('trail')?.keys() ?? [])].sort()
    expect(reference.length).toBeGreaterThan(0)
    for (const name of THEME_NAMES) {
      expect([...(themes.get(name)?.keys() ?? [])].sort(), name).toEqual(reference)
    }
  })

  describe.each(THEME_NAMES)('%s theme', (name) => {
    it.each(PAIRS)('%s on %s reaches 4.5:1', (text, background) => {
      const tokens = themes.get(name)
      const fg = tokens?.get(text)
      const bg = tokens?.get(background)
      expect(fg, `--pursio-${text}`).toBeDefined()
      expect(bg, `--pursio-${background}`).toBeDefined()
      const ratio = contrastRatio(parseColor(fg ?? ''), parseColor(bg ?? ''))
      expect(ratio, `${text} ${fg} on ${background} ${bg}: ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(
        MIN_RATIO,
      )
    })
  })
})
