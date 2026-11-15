// Smoke checks of the Fresh configuration (spec: fresh, task 10.5, Req 18.1, 18.2, 18.4, 3.8).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const NUXT_CONFIG = readFileSync(join(ROOT, 'nuxt.config.ts'), 'utf8')

/** The `runtimeConfig.public` block of nuxt.config.ts. */
function publicBlock(source: string): string {
  const start = source.indexOf('public: {')
  if (start < 0) return ''
  let depth = 0
  for (let i = source.indexOf('{', start); i < source.length; i += 1) {
    if (source[i] === '{') depth += 1
    else if (source[i] === '}') {
      depth -= 1
      if (depth === 0) return source.slice(start, i + 1)
    }
  }
  return source.slice(start)
}

describe('Fresh configuration', () => {
  it('the env example file lists NUXT_FRESH_CHECK_SECRET with a placeholder', () => {
    const example = readFileSync(join(ROOT, '.env.example'), 'utf8')
    const line = example.split('\n').find((l) => l.startsWith('NUXT_FRESH_CHECK_SECRET='))
    expect(line).toBeDefined()
    expect(line?.slice('NUXT_FRESH_CHECK_SECRET='.length).trim()).not.toBe('')
  })

  it('keeps freshCheckSecret server-only', () => {
    expect(NUXT_CONFIG).toContain("freshCheckSecret: ''")
    expect(publicBlock(NUXT_CONFIG)).not.toContain('freshCheckSecret')
  })

  it('runs every function with maxDuration 120', () => {
    expect(NUXT_CONFIG).toContain('vercel: { functions: { maxDuration: 120 } }')
  })

  it('adds no dependency', () => {
    const pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> } = JSON.parse(
      readFileSync(join(ROOT, 'package.json'), 'utf8'),
    )
    expect(Object.keys(pkg.dependencies ?? {}).sort()).toEqual(['@supabase/supabase-js', 'elkjs', 'nuxt', 'vue', 'vue-router', 'zod'])
    expect(Object.keys(pkg.devDependencies ?? {}).sort()).toEqual([
      '@tailwindcss/vite',
      'fast-check',
      'tailwindcss',
      'typescript',
      'vitest',
      'vue-tsc',
    ])
  })
})
