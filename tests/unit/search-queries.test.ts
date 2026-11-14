import { describe, expect, it } from 'vitest'
import { addLevelTerm, repairSearchQueries, validateSearchQueries } from '../../shared/utils/search-queries'

const ctx = { hobby: 'chess', skillTitle: 'How each piece moves', level: 'beginner' as const }

describe('addLevelTerm', () => {
  it('appends the first level term to the first query when none has one', () => {
    const fixed = addLevelTerm(['chess piece movement', 'how chess pieces move'], 'beginner')
    expect(fixed).toEqual(['chess piece movement for beginners', 'how chess pieces move'])
    expect(validateSearchQueries(fixed, ctx)).toEqual([])
  })

  it('leaves queries that already have a level term unchanged', () => {
    const queries = ['chess piece movement', 'chess basics pieces']
    expect(addLevelTerm(queries, 'beginner')).toEqual(queries)
  })

  it('uses a later query when the first has no room', () => {
    const long = `chess ${'x'.repeat(90)}`
    expect(addLevelTerm([long, 'chess pieces'], 'advanced')).toEqual([long, 'chess pieces advanced'])
  })

  it('returns the queries unchanged when none has room', () => {
    const long = `chess ${'x'.repeat(92)}`
    const queries = [long, `${long}y`]
    expect(addLevelTerm(queries, 'intermediate')).toEqual(queries)
    expect(validateSearchQueries(queries, { ...ctx, level: 'intermediate' })).toContain('level_term')
  })
})

describe('repairSearchQueries', () => {
  const music = { hobby: 'music taste', skillTitle: 'Setting up your listening', level: 'beginner' as const }

  it('puts the hobby in front of a query that names neither hobby nor skill', () => {
    const fixed = repairSearchQueries(['how to choose good headphones', 'best speakers for music for beginners'], music)
    expect(fixed).toEqual(['music taste how to choose good headphones', 'best speakers for music for beginners'])
    expect(validateSearchQueries(fixed, music)).toEqual([])
  })

  it('fixes a missing name and a missing level term together', () => {
    const fixed = repairSearchQueries(['how to choose good headphones', 'speaker placement guide'], music)
    expect(validateSearchQueries(fixed, music)).toEqual([])
  })

  it('leaves valid queries unchanged', () => {
    const queries = ['music listening basics', 'how to set up speakers for listening']
    expect(repairSearchQueries(queries, music)).toEqual(queries)
  })
})
