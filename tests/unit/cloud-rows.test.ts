import { describe, expect, it } from 'vitest'
import sampleJson from '../../data/sample-bouldering.json'
import type { SkillTree } from '../../shared/types/skill-tree'
import { loadSkillTree } from '../../shared/utils/skill-tree-load'
import {
  buildCloudPaths,
  parsePathRow,
  parseProgressRow,
  toPathInsertRow,
  toProgressRow,
} from '../../app/utils/cloud-rows'

const loaded = loadSkillTree(sampleJson)
if (!loaded.ok) throw new Error('Sample_Tree must load')
const bouldering: SkillTree = loaded.value
const withHobby = (hobby: string): SkillTree => ({ ...bouldering, hobby })
const guitar = withHobby('Guitar')
const chess = withHobby('  Chess  Openings ')
const [firstId, secondId, thirdId] = bouldering.sections.flatMap(section => section.nodes.map(node => node.id)) as [
  string,
  string,
  string,
]

const CREATED = '2026-01-02T03:04:05.000Z'

function pathRow(id: string, tree: unknown, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    user_id: 'user-1',
    hobby: 'as typed',
    hobby_id: 'ignored',
    level: 'new',
    tree,
    mascot_set: 'boulder',
    model: 'model-1',
    archived: false,
    created_at: CREATED,
    ...overrides,
  }
}

describe('parsePathRow', () => {
  it('maps a Path_Row to a CloudPath with empty Progress and a recomputed Hobby_Id', () => {
    expect(parsePathRow(pathRow('p1', chess, { level: 'serious', archived: true }))).toEqual({
      pathId: 'p1',
      record: { id: 'chess openings', tree: chess, model: 'model-1', addedAt: Date.parse(CREATED), archived: true },
      level: 'serious',
      progress: { completed: [], quests: {} },
      completedAt: {},
    })
  })

  it.each([
    ['a tree the Tree_Loader rejects', pathRow('p1', { hobby: 'Guitar', sections: [], mascot: { set: 'x' } })],
    ['a missing tree', pathRow('p1', null)],
    ['an empty model', pathRow('p1', guitar, { model: '' })],
    ['a null model', pathRow('p1', guitar, { model: null })],
    ['an unknown level', pathRow('p1', guitar, { level: 'expert' })],
    ['an empty id', pathRow('', guitar)],
    ['a creation time that is not a date', pathRow('p1', guitar, { created_at: 'yesterday' })],
    ['a missing archived flag', pathRow('p1', guitar, { archived: undefined })],
    ['a value that is not a row', 'row'],
    ['null', null],
  ])('gives null for %s', (_, row) => {
    expect(parsePathRow(row)).toBeNull()
  })
})

describe('buildCloudPaths', () => {
  it('skips a row with a rejected tree or an empty model while the others load (Req 5.4)', () => {
    const paths = buildCloudPaths(
      [
        pathRow('p1', bouldering),
        pathRow('p2', { hobby: 'Broken' }),
        pathRow('p3', guitar, { model: '' }),
        pathRow('p4', chess, { archived: true }),
      ],
      [],
    )
    expect(paths.map(path => [path.pathId, path.record.id, path.record.archived])).toEqual([
      ['p1', 'bouldering', false],
      ['p4', 'chess openings', true],
    ])
  })

  it('leaves out a repeated Hobby_Id and keeps the first row', () => {
    const paths = buildCloudPaths([pathRow('p1', guitar), pathRow('p2', withHobby(' GUITAR '))], [])
    expect(paths.map(path => path.pathId)).toEqual(['p1'])
  })

  it('joins each path with its Progress_Row by path id', () => {
    const paths = buildCloudPaths(
      [pathRow('p1', bouldering), pathRow('p2', guitar)],
      [
        { path_id: 'p2', user_id: 'user-1', completed: [secondId], quests: {}, completed_at: { [secondId]: 20 } },
        {
          path_id: 'p1',
          user_id: 'user-1',
          completed: [firstId],
          quests: { [firstId]: [true, false, true] },
          completed_at: { [firstId]: 10 },
        },
        { path_id: 'gone', user_id: 'user-1', completed: [thirdId], quests: {}, completed_at: {} },
        null,
        'not a row',
      ],
    )
    expect(paths.map(path => [path.pathId, path.progress, path.completedAt])).toEqual([
      ['p1', { completed: [firstId], quests: { [firstId]: [true, false, true] } }, { [firstId]: 10 }],
      ['p2', { completed: [secondId], quests: {} }, { [secondId]: 20 }],
    ])
  })

  it('gives a path without a Progress_Row empty Progress', () => {
    const [path] = buildCloudPaths([pathRow('p1', bouldering)], [])
    expect(path?.progress).toEqual({ completed: [], quests: {} })
    expect(path?.completedAt).toEqual({})
  })

  it('gives an empty list for no rows', () => {
    expect(buildCloudPaths([], [{ path_id: 'p1', completed: [], quests: {}, completed_at: {} }])).toEqual([])
  })
})

describe('parseProgressRow', () => {
  it('prunes unknown ids, repeated ids and timestamps of Nodes that are not completed (Req 6.10)', () => {
    const parsed = parseProgressRow(
      {
        path_id: 'p1',
        user_id: 'user-1',
        completed: ['ghost', firstId, secondId, firstId],
        quests: { [firstId]: [true, true, false], ghost: [true, true, true] },
        completed_at: { [firstId]: 100, [thirdId]: 300, ghost: 400 },
      },
      bouldering,
    )
    expect(parsed.progress).toEqual({ completed: [firstId, secondId], quests: { [firstId]: [true, true, false] } })
    // `secondId` is completed without a timestamp; `thirdId` has one but is not completed.
    expect(parsed.completedAt).toEqual({ [firstId]: 100 })
  })

  it('gives empty Progress for an empty row', () => {
    expect(parseProgressRow({ completed: [], quests: {}, completed_at: {} }, bouldering)).toEqual({
      progress: { completed: [], quests: {} },
      completedAt: {},
    })
  })

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['an array', []],
    ['an object without columns', {}],
    ['a completed column that is not a list', { completed: 'all', quests: {}, completed_at: {} }],
    ['a quest entry that is not a triple', { completed: [], quests: { [firstId]: [true] }, completed_at: {} }],
    ['a timestamp that is not a number', { completed: [firstId], quests: {}, completed_at: { [firstId]: 'now' } }],
    ['a missing completed_at column', { completed: [firstId], quests: {} }],
  ])('gives empty Progress for %s', (_, row) => {
    expect(parseProgressRow(row, bouldering)).toEqual({ progress: { completed: [], quests: {} }, completedAt: {} })
  })
})

describe('row writers', () => {
  it('toPathInsertRow keeps the Path_Row id and the creation time', () => {
    const path = parsePathRow(pathRow('p1', chess, { level: 'some', archived: true }))
    if (!path) throw new Error('row must parse')
    expect(toPathInsertRow('user-9', path)).toEqual({
      id: 'p1',
      user_id: 'user-9',
      hobby: chess.hobby,
      hobby_id: 'chess openings',
      level: 'some',
      tree: chess,
      mascot_set: chess.mascot.set,
      model: 'model-1',
      archived: true,
      created_at: CREATED,
    })
  })

  it('toProgressRow copies Progress and timestamps', () => {
    const progress = { completed: [firstId], quests: { [firstId]: [true, false, false] as [boolean, boolean, boolean] } }
    const completedAt = { [firstId]: 5 }
    const row = toProgressRow('p1', 'user-9', progress, completedAt)
    expect(row).toEqual({
      path_id: 'p1',
      user_id: 'user-9',
      completed: [firstId],
      quests: { [firstId]: [true, false, false] },
      completed_at: { [firstId]: 5 },
    })
    expect(row.completed).not.toBe(progress.completed)
    expect(row.completed_at).not.toBe(completedAt)
  })
})
