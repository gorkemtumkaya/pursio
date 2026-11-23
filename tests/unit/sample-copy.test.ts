// Copy of the sample path page (spec: sample-path, Requirement 13).
import { describe, expect, it } from 'vitest'
import { SAMPLE_COPY } from '../../app/utils/sample-copy'

/** Dash_Character of Requirement 13. */
const DASH = /[-‐-―−﹘﹣－]/

/** Every string the module can produce, with the functions called on typical and edge values. */
function allStrings(): string[] {
  const c = SAMPLE_COPY
  return [
    c.pageTitle('Guitar'),
    c.tag,
    c.logIn,
    c.buildOwn,
    c.introLine('Photography', 14, 3),
    c.introLine('Guitar', 1, 1),
    c.introText,
    c.nodeTag,
    c.tapToPreview,
    c.milestone,
    c.firstStatus(3, 2),
    c.firstStatus(3, 1),
    c.firstStatus(3, 0),
    c.bannerCount(7),
    c.bannerCount(1),
    c.opensAfter(1),
    c.opensAfter(2),
    c.opensAfter(3),
    c.previewFirst,
    c.previewOther,
    c.position(1, 3),
    c.questsHeading(3),
    c.questXp(10),
    c.videosHeading,
    c.noVideos,
    c.makeMine,
    c.mineHeading,
    c.mineLabel,
    c.build,
    c.smallLine,
    c.barLine,
    c.barButton,
    c.skip,
    c.placeholder('photography'),
    c.placeholder('guitar'),
    c.placeholder('birdwatching'),
    c.placeholder('chess'),
    c.foundingLine,
    c.foundingLink,
  ]
}

describe('SAMPLE_COPY', () => {
  it('holds no dash or hyphen character (Req 13.2)', () => {
    expect(allStrings().filter((text) => DASH.test(text))).toEqual([])
  })

  it('every key is covered by the dash check', () => {
    // A new key must be added here and to allStrings() above.
    expect(Object.keys(SAMPLE_COPY).sort()).toEqual(
      [
        'pageTitle', 'tag', 'logIn', 'buildOwn', 'introLine', 'introText', 'nodeTag', 'tapToPreview', 'milestone',
        'firstStatus', 'bannerCount', 'opensAfter', 'previewFirst', 'previewOther', 'position', 'questsHeading',
        'questXp', 'videosHeading', 'noVideos', 'makeMine', 'mineHeading', 'mineLabel', 'build', 'smallLine',
        'barLine', 'barButton', 'skip', 'placeholder', 'foundingLine', 'foundingLink',
      ].sort(),
    )
  })

  it('has the exact texts of Requirement 13', () => {
    const c = SAMPLE_COPY
    expect(c.pageTitle('Guitar')).toBe('Guitar sample path · Pursio')
    expect(c.tag).toBe('SAMPLE PATH')
    expect(c.introLine('Photography', 14, 3)).toBe('PHOTOGRAPHY · 14 SKILLS · 3 SECTIONS')
    expect(c.introLine('Guitar', 1, 1)).toBe('GUITAR · 1 SKILL · 1 SECTION')
    expect(c.introText).toBe(
      'Tap any skill to see its quests and videos. This is an example. Tell Wick where you are and he rebuilds it around you.',
    )
    expect(c.nodeTag).toBe('START HERE')
    expect(c.firstStatus(3, 2)).toBe('3 quests · 2 videos')
    expect(c.firstStatus(3, 1)).toBe('3 quests · 1 video')
    expect(c.firstStatus(3, 0)).toBe('3 quests')
    expect(c.bannerCount(7)).toBe('7 skills')
    expect(c.bannerCount(1)).toBe('1 skill')
    expect([c.opensAfter(1), c.opensAfter(2), c.opensAfter(5)]).toEqual([
      'Opens after the first milestone',
      'Opens after the second milestone',
      'Opens after the milestone above',
    ])
    expect(c.position(1, 3)).toBe('Section 1 · Skill 3')
    expect(`${c.questsHeading(3)} ${c.questXp(10)}`).toBe('3 QUESTS +10 XP EACH')
    expect(c.videosHeading).toBe('VIDEOS PICKED FOR THIS SKILL')
    expect(c.noVideos).toBe('Videos appear when you reach this skill.')
    expect(c.mineLabel).toBe('Tell Wick where you are and where you want to get. He rebuilds this path around you.')
    expect(c.smallLine).toBe('Free to try. No signup. About 20 seconds.')
    expect([c.barLine, c.barButton, c.skip, c.makeMine]).toEqual([
      'Free. No signup.',
      'Tell Wick where I am',
      'Skip, build it without a note',
      'Make this path mine',
    ])
  })

  it('has the owner’s placeholder notes (decision 15) and a fallback for other hobbies', () => {
    expect(SAMPLE_COPY.placeholder('photography')).toBe(
      'I shoot on auto with a mirrorless camera. I want portraits with a soft background.',
    )
    expect(SAMPLE_COPY.placeholder('guitar')).toBe('I know a few chords and play the same old songs. I want to sing while I play.')
    expect(SAMPLE_COPY.placeholder('birdwatching')).toBe(
      'I can only name a sparrow and a crow. I want to know the birds in my local park.',
    )
    expect(SAMPLE_COPY.placeholder('toString')).toBe('I am new to this. I want to get good enough to enjoy it.')
  })
})
