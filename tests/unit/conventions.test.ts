import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Static conventions for the Path_View (Req 13.1, 13.5, 13.7, 13.10, 14.1, 14.2):
 * every color, font, radius and shadow comes from theme tokens, no blurred
 * shadows, no emoji, no `any`, and dependencies stay pinned to the known set.
 */

const ROOT = fileURLToPath(new URL('../../', import.meta.url))

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? listFiles(path) : [path]
  })
}

const SCANNED = [
  ...listFiles(join(ROOT, 'app/components/path')).filter((file) => /\.(vue|ts)$/.test(file)),
  join(ROOT, 'app/pages/path.vue'),
].map((path) => ({ name: relative(ROOT, path), source: readFileSync(path, 'utf8') }))

// CSS named colors (CSS Color Module Level 4), excluding keywords like
// `transparent` and `currentColor`.
const NAMED_COLORS = new Set(
  (
    'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown ' +
    'burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan ' +
    'darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid ' +
    'darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet ' +
    'deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ' +
    'ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki ' +
    'lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow ' +
    'lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray ' +
    'lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine ' +
    'mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise ' +
    'mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab ' +
    'orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru ' +
    'pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown ' +
    'seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan ' +
    'teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen'
  ).split(' '),
)

const HEX = /(?<![\w&-])#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b/i
const COLOR_FN = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/i
const EMOJI = /[\p{Extended_Pictographic}\p{Regional_Indicator}\u{FE0F}\u{20E3}]/u
const PURSIO_VAR_ONLY = /^\s*var\(--pursio-[\w-]+\)\s*$/

function namedColorIn(value: string): string | undefined {
  return value
    .toLowerCase()
    .split(/[^a-z]+/)
    .find((word) => NAMED_COLORS.has(word))
}

/** First literal color (hex, color function or named color) in a CSS value, if any. */
function literalColor(raw: string, checkNamed = true): string | undefined {
  // Custom property names like `var(--pursio-gold)` are token references, not colors.
  const value = raw.replace(/var\(--[\w-]+/g, 'var(')
  const hex = HEX.exec(value)
  if (hex) return hex[0]
  const fn = COLOR_FN.exec(value)
  if (fn) return fn[0]
  return checkNamed ? namedColorIn(value) : undefined
}

function blocks(source: string, tag: 'script' | 'style' | 'template'): string[] {
  const pattern = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'g')
  return [...source.matchAll(pattern)].map((match) => match[1] ?? '')
}

function templateOf(file: { name: string; source: string }): string {
  if (!file.name.endsWith('.vue')) return ''
  // Outer <template> may contain nested <template v-if> blocks; take everything
  // between the first opening and the last closing tag.
  const start = file.source.indexOf('<template')
  const end = file.source.lastIndexOf('</template>')
  return start === -1 || end === -1 ? '' : file.source.slice(start, end)
}

function scriptOf(file: { name: string; source: string }): string {
  return file.name.endsWith('.vue') ? blocks(file.source, 'script').join('\n') : file.source
}

function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function stringLiterals(code: string): string[] {
  return [...code.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`([^`]*)`/g)].map(
    (match) => match[1] ?? match[2] ?? match[3] ?? '',
  )
}

/** Checks `prop: value` CSS declarations from style blocks or static style attributes. */
function cssDeclarationViolations(css: string): string[] {
  const out: string[] = []
  for (const match of stripComments(css).matchAll(/([\w-]+)\s*:\s*([^;{}]+)/g)) {
    const prop = (match[1] ?? '').toLowerCase()
    const value = (match[2] ?? '').trim()
    if (prop.startsWith('--')) continue
    const tokenOnly = PURSIO_VAR_ONLY.test(value) || /^(?:inherit|initial|unset)$/i.test(value)
    if ((prop === 'font-family' || prop === 'font') && !tokenOnly) out.push(`${prop}: ${value}`)
    if (/^border(?:-[a-z]+)*-radius$/.test(prop) && !tokenOnly && value !== '0') out.push(`${prop}: ${value}`)
    if (prop === 'box-shadow' && !tokenOnly && value !== 'none') out.push(`${prop}: ${value}`)
    if (/drop-shadow\(/i.test(value)) out.push(`${prop}: ${value}`)
    const color = literalColor(value)
    if (color) out.push(`${prop}: ${value} (literal color ${color})`)
  }
  return out
}

/** The utility part of a class token, with variants like `lg:` or `has-[input:focus]:` removed. */
function utilityOf(token: string): string {
  let depth = 0
  let last = 0
  for (let i = 0; i < token.length; i++) {
    const char = token[i]
    if (char === '[' || char === '(') depth++
    else if (char === ']' || char === ')') depth--
    else if (char === ':' && depth === 0) last = i + 1
  }
  return token.slice(last).replace(/^!|!$/g, '')
}

const TW_PALETTE =
  /^-?(?:bg|text|border(?:-[trblxyse])?|fill|stroke|ring|ring-offset|outline|shadow|inset-shadow|drop-shadow|from|via|to|decoration|accent|caret|divide|placeholder)-(?:white|black|(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3})(?:\/\d+)?$/
const TW_BLURRED_SHADOW = /^(?:shadow|inset-shadow|drop-shadow)(?:-(?:2xs|xs|sm|md|lg|xl|2xl|inner))?$/
const TW_BLUR = /^(?:blur|backdrop-blur)(?:-|$)/

/** Violations in a single class token. */
function classTokenViolations(token: string): string[] {
  const utility = utilityOf(token)
  const out: string[] = []
  if (TW_PALETTE.test(utility)) out.push(`${token} (default palette color)`)
  if (TW_BLURRED_SHADOW.test(utility)) out.push(`${token} (blurred default shadow)`)
  if (TW_BLUR.test(utility)) out.push(`${token} (blur)`)
  const arbitrary = /^-?([\w-]+?)-\[(.*)\]$/.exec(utility)
  if (!arbitrary) return out
  const prefix = arbitrary[1] ?? ''
  const content = arbitrary[2] ?? ''
  const tokenOnly = PURSIO_VAR_ONLY.test(content)
  if (/^rounded(?:-[a-z]{1,2})?$/.test(prefix) && !tokenOnly) out.push(`${token} (literal radius)`)
  if (/^(?:inset-)?(?:drop-)?shadow$/.test(prefix) && !tokenOnly) out.push(`${token} (literal shadow)`)
  if (prefix === 'font' && !/^\d+$/.test(content) && !tokenOnly) out.push(`${token} (literal font family)`)
  const color = literalColor(content.replace(/_/g, ' '))
  if (color) out.push(`${token} (literal color ${color})`)
  return out
}

function classViolations(code: string): string[] {
  return code
    .split(/[\s'"`{}<>=,]+/)
    .filter((token) => token.length > 0)
    .flatMap(classTokenViolations)
}

function fillStrokeViolations(template: string): string[] {
  const out: string[] = []
  const allowed = (value: string): boolean =>
    value === 'currentColor' || value === 'none' || PURSIO_VAR_ONLY.test(value)
  for (const match of template.matchAll(/(?<![\w-])(:|v-bind:)?(fill|stroke)="([^"]*)"/g)) {
    const bound = match[1] !== undefined
    const value = match[3] ?? ''
    const literals = bound ? stringLiterals(value) : [value]
    for (const literal of literals) {
      if (!allowed(literal)) out.push(`${match[0]}`)
    }
  }
  return out
}

function scriptStyleViolations(script: string): string[] {
  const out: string[] = []
  const code = stripComments(script)
  for (const match of code.matchAll(/['"]?(fontFamily|font-family|borderRadius|border-radius|boxShadow|box-shadow|filter)['"]?\s*:/g)) {
    out.push(`style key ${match[1] ?? ''}`)
  }
  for (const literal of stringLiterals(code)) {
    const color = literalColor(literal, false)
    if (color) out.push(`string literal "${literal}" (literal color ${color})`)
  }
  return out
}

function fileViolations(file: { name: string; source: string }): string[] {
  const template = templateOf(file)
  const script = scriptOf(file)
  const styles = file.name.endsWith('.vue') ? blocks(file.source, 'style').join('\n') : ''
  const staticStyles = [...template.matchAll(/(?<![\w:-])style="([^"]*)"/g)].map((match) => match[1] ?? '')
  const out = [
    ...cssDeclarationViolations(styles),
    ...staticStyles.flatMap(cssDeclarationViolations),
    ...fillStrokeViolations(template),
    ...scriptStyleViolations(script),
    ...classViolations(template),
    ...classViolations(stringLiterals(stripComments(script)).join(' ')),
  ]
  const hex = HEX.exec(template)
  if (hex) out.push(`hex color ${hex[0]} in template`)
  const fn = COLOR_FN.exec(template)
  if (fn) out.push(`color function ${fn[0]} in template`)
  return out.map((violation) => `${file.name}: ${violation}`)
}

describe('path view styling conventions (Req 13.1, 13.5)', () => {
  it('scans the path components and page', () => {
    expect(SCANNED.length).toBeGreaterThan(10)
    expect(SCANNED.map((file) => file.name)).toContain('app/pages/path.vue')
  })

  it('takes colors, fonts, radii and shadows only from theme tokens', () => {
    expect(SCANNED.flatMap(fileViolations)).toEqual([])
  })
})

describe('checker self-test', () => {
  it('flags literal values', () => {
    for (const token of ['bg-[#ff0000]', 'shadow-[0_4px_12px_var(--pursio-ink)]', 'rounded-[12px]', "font-['Inter']", 'text-[red]', 'shadow-md', 'bg-red-500', 'lg:border-[rgb(0,0,0)]']) {
      expect(classTokenViolations(token), token).not.toEqual([])
    }
    expect(cssDeclarationViolations('border-radius: 12px; box-shadow: 0 2px 4px black; color: #fff')).toHaveLength(4)
    expect(fillStrokeViolations('<path fill="red" :stroke="on ? \'#000\' : \'none\'" />')).toHaveLength(2)
  })

  it('allows token utilities and unrelated arbitrary values', () => {
    for (const token of [
      'motion-safe:animate-[pursio-unlock_450ms_ease-out]',
      'text-[15px]',
      'lg:grid-cols-[248px_minmax(0,1fr)_clamp(360px,30vw,460px)]',
      'rounded-2xl',
      'rounded-full',
      'rounded-node',
      'shadow-raised-primary',
      'font-display',
      'tracking-[0.08em]',
      'has-[input:focus-visible]:outline-ink',
      'max-h-[90dvh]',
      'bg-[var(--pursio-gold)]',
    ]) {
      expect(classTokenViolations(token), token).toEqual([])
    }
    expect(cssDeclarationViolations('background: conic-gradient(var(--pursio-primary) 0 var(--ring-deg), var(--pursio-line) 0);')).toEqual([])
    expect(fillStrokeViolations(`<svg :fill="filled ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2.2">`)).toEqual([])
  })
})

describe('path view text and code conventions (Req 13.7, 13.10)', () => {
  it('contains no emoji characters', () => {
    const hits = SCANNED.filter((file) => EMOJI.test(file.source)).map((file) => file.name)
    expect(hits).toEqual([])
  })

  it('uses <script setup lang="ts"> in every component', () => {
    const vue = SCANNED.filter((file) => file.name.endsWith('.vue'))
    const bad = vue.filter((file) => {
      const tags = [...file.source.matchAll(/<script\b[^>]*>/g)].map((match) => match[0])
      return tags.length === 0 || tags.some((tag) => !/\bsetup\b/.test(tag) || !/lang="ts"/.test(tag))
    })
    expect(bad.map((file) => file.name)).toEqual([])
  })

  it('contains no `any` type', () => {
    const hits = SCANNED.filter((file) => {
      const code = stripComments(scriptOf(file)).replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`[^`]*`/g, "''")
      return /\bany\b/.test(code)
    }).map((file) => file.name)
    expect(hits).toEqual([])
  })
})

describe('package.json dependencies (Req 14.1, 14.2)', () => {
  const pkg: unknown = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
  const section = (key: 'dependencies' | 'devDependencies'): Record<string, string> => {
    if (typeof pkg !== 'object' || pkg === null || !(key in pkg)) return {}
    const value: unknown = (pkg as Record<string, unknown>)[key]
    if (typeof value !== 'object' || value === null) return {}
    return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
  }
  const deps = section('dependencies')
  const devDeps = section('devDependencies')
  const EXACT = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

  it('lists the new packages in the right sections with exact versions', () => {
    for (const name of ['zod', 'elkjs', '@supabase/supabase-js']) expect(deps[name], name).toMatch(EXACT)
    for (const name of ['fast-check', 'vitest']) expect(devDeps[name], name).toMatch(EXACT)
  })

  it('adds no dependency beyond the known set', () => {
    expect(Object.keys(deps).sort()).toEqual(['@supabase/supabase-js', 'elkjs', 'nuxt', 'vue', 'vue-router', 'zod'])
    expect(Object.keys(devDeps).sort()).toEqual(['@tailwindcss/vite', 'fast-check', 'tailwindcss', 'typescript', 'vitest', 'vue-tsc'])
  })

  it('pins every dependency exactly', () => {
    const loose = Object.entries({ ...deps, ...devDeps }).filter(([, version]) => !EXACT.test(version))
    expect(loose).toEqual([])
  })
})

describe('service role key location (spec: accounts-cloud-save, Req 1.5, 9.13)', () => {
  it('is named only in nuxt.config.ts and server/utils/account-runtime.ts', () => {
    const KEY_NAME = ['supabase', 'ServiceRoleKey'].join('')
    const scanned = ['app', 'server', 'shared'].flatMap((dir) => listFiles(join(ROOT, dir)))
    const hits = scanned
      .filter((path) => /\.(vue|ts|js|mjs|json|md)$/.test(path))
      .filter((path) => readFileSync(path, 'utf8').includes(KEY_NAME))
      .map((path) => relative(ROOT, path))
    expect(hits).toEqual(['server/utils/account-runtime.ts'])
    expect(readFileSync(join(ROOT, 'nuxt.config.ts'), 'utf8')).toContain(`${KEY_NAME}: ''`)
  })
})
