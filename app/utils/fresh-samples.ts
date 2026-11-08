// Static "Fresh this week" entries for the node detail (Req 8.6).
// Real web content per node arrives with a later spec; until then each
// Sample_Tree node id gets fixed entries, and unknown ids get a fallback list.

export type FreshItem =
  | { kind: 'video'; title: string; source: string; durationMinutes: number }
  | { kind: 'article'; title: string; source: string; readMinutes: number }

/** Card meta line in the reference design style, e.g. "Video · 8 min" or "Article · 5 min read". */
export function freshMeta(item: FreshItem): string {
  return item.kind === 'video'
    ? `Video · ${item.durationMinutes} min`
    : `Article · ${item.readMinutes} min read`
}

const video = (title: string, source: string, durationMinutes: number): FreshItem => ({
  kind: 'video',
  title,
  source,
  durationMinutes,
})

const article = (title: string, source: string, readMinutes: number): FreshItem => ({
  kind: 'article',
  title,
  source,
  readMinutes,
})

export const FRESH_FALLBACK: readonly FreshItem[] = [
  video('Your first month on the wall', 'Climbing Daily', 10),
  article('How to practice with a plan', 'Beta Notes', 4),
  video('Common beginner mistakes', 'Wall Sessions', 7),
]

export const FRESH_SAMPLES: Readonly<Record<string, readonly FreshItem[]>> = {
  'gear-basics': [
    video('Climbing shoes: what fits a beginner', 'Wall Sessions', 9),
    article('Chalk, brushes and what you can skip', 'Beta Notes', 4),
    video('Packing a bag for your first session', 'Climbing Daily', 6),
  ],
  'reading-grades': [
    article('What V-grades actually mean', 'Beta Notes', 5),
    video('Why grades differ between gyms', 'Climbing Daily', 8),
    article('Picking the right grade to start on', 'Crag Journal', 3),
  ],
  'falling-safely': [
    video('How to fall off a boulder', 'Wall Sessions', 7),
    article('Down-climbing instead of jumping', 'Beta Notes', 4),
    video('Landing drills on the mats', 'Climbing Daily', 5),
  ],
  'warm-up-routine': [
    video('A 10-minute bouldering warm-up', 'Climbing Daily', 10),
    article('Why cold fingers get hurt', 'Crag Journal', 5),
    video('Easy traverses to get moving', 'Wall Sessions', 6),
  ],
  'footwork-basics': [
    video('The silent feet drill', 'Wall Sessions', 8),
    article('Why your feet keep slipping', 'Beta Notes', 5),
    video('Edging vs smearing, explained', 'Climbing Daily', 12),
  ],
  'body-positioning': [
    video('Hips to the wall: the basics', 'Wall Sessions', 9),
    article('Straight arms save energy', 'Beta Notes', 4),
    video('Turning your hips on steep walls', 'Climbing Daily', 11),
  ],
  'resting-on-the-wall': [
    article('Shaking out between moves', 'Crag Journal', 4),
    video('Finding rests on easy problems', 'Wall Sessions', 7),
    article('Breathing while you climb', 'Beta Notes', 3),
  ],
  'first-v2': [
    video('Projecting your first V2', 'Climbing Daily', 12),
    article('How many tries is normal?', 'Beta Notes', 5),
    video('Five V2s, broken down', 'Wall Sessions', 14),
  ],
  'flagging': [
    video('Flagging in 8 minutes', 'Wall Sessions', 8),
    article('Inside flag or outside flag?', 'Beta Notes', 6),
    video('Back flag drills for balance', 'Climbing Daily', 9),
  ],
  'heel-hooks': [
    video('Heel hooks for beginners', 'Climbing Daily', 10),
    article('Pull with your hamstring, not your arms', 'Crag Journal', 5),
    video('Heel hook mistakes to avoid', 'Wall Sessions', 7),
  ],
  'toe-hooks': [
    video('Toe hooks on overhangs', 'Wall Sessions', 9),
    article('When a toe hook beats a heel hook', 'Beta Notes', 4),
    video('Bicycle hooks, step by step', 'Climbing Daily', 8),
  ],
  'reading-a-route': [
    article('Reading a problem from the ground', 'Beta Notes', 6),
    video('Miming beta before you climb', 'Wall Sessions', 7),
    video('Spotting the crux move', 'Climbing Daily', 10),
  ],
  'first-v4': [
    video('What changes at V4', 'Climbing Daily', 13),
    article('A four-week plan for your first V4', 'Crag Journal', 7),
    video('Breaking a V4 into sections', 'Wall Sessions', 11),
  ],
}

/** Fresh entries for a node id, or the fallback list when the id has no samples. */
export function freshFor(nodeId: string): readonly FreshItem[] {
  return Object.hasOwn(FRESH_SAMPLES, nodeId) ? FRESH_SAMPLES[nodeId]! : FRESH_FALLBACK
}
