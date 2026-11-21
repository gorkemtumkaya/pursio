import { describe, expect, it } from 'vitest'
import { CHIP_REMOVE_LABELS, CHIP_TAGS, INTAKE_COPY, INTAKE_LEVEL_LABELS } from '../../app/utils/intake-copy'

/** Every string the copy file can produce, the functions called with sample numbers. */
function allCopy(): string[] {
  const values: string[] = []
  for (const value of [...Object.values(INTAKE_COPY), ...Object.values(CHIP_TAGS), ...Object.values(CHIP_REMOVE_LABELS), ...Object.values(INTAKE_LEVEL_LABELS)]) {
    if (typeof value === 'string') values.push(value)
    else values.push(value(0), value(40), value(180))
  }
  return values
}

describe('path intake copy (Req 15.1, 15.2, 16.14)', () => {
  it('has no hyphen, en dash, em dash or other dash character', () => {
    for (const text of allCopy()) expect(text).not.toMatch(/[-‐-―−﹘﹣－]/)
  })

  it('has the strings of the mockups', () => {
    expect(INTAKE_COPY.wickPanel).toBe('Got it. Anything to fix?')
    expect(INTAKE_COPY.questionKnownHint).toBe('these start as done')
    expect(INTAKE_COPY.headStartXp(60)).toBe('+60 XP')
    expect(CHIP_TAGS.avoid).toBe('Not for you')
  })
})
