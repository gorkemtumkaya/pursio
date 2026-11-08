/**
 * Icon set for the skill path UI. Shapes are drawn on a 24×24 grid and
 * rendered by `PathIcon.vue` with `stroke="currentColor"`, so the color
 * always comes from the surrounding text color (theme tokens).
 */

export const ICON_NAMES = [
  'check',
  'lock',
  'star',
  'trophy',
  'compass',
  'close',
  'flame',
  'bolt',
  'map',
  'feed',
  'target',
  'user',
  'chevron',
  'mountain',
  'play',
  'article',
  'palette',
  'settings',
] as const

export type IconName = (typeof ICON_NAMES)[number]

export type IconShape =
  | { readonly tag: 'path'; readonly d: string }
  | { readonly tag: 'rect'; readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly rx: number }
  | { readonly tag: 'circle'; readonly cx: number; readonly cy: number; readonly r: number }

export interface IconDefinition {
  /** Fill the shapes with `currentColor` (solid glyphs like star and play). */
  readonly filled: boolean
  readonly shapes: readonly IconShape[]
}

const LOCK_SHAPES: readonly IconShape[] = [
  { tag: 'rect', x: 5, y: 11, width: 14, height: 9, rx: 2 },
  { tag: 'path', d: 'M8 11V8a4 4 0 0 1 8 0v3' },
]

export const ICONS: Readonly<Record<IconName, IconDefinition>> = {
  check: { filled: false, shapes: [{ tag: 'path', d: 'M5 12.5l4.5 4.5L19 7.5' }] },
  lock: { filled: false, shapes: LOCK_SHAPES },
  star: {
    filled: true,
    shapes: [{ tag: 'path', d: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z' }],
  },
  trophy: {
    filled: false,
    shapes: [
      { tag: 'path', d: 'M8 4h8v5a4 4 0 0 1-8 0z' },
      { tag: 'path', d: 'M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4' },
      { tag: 'path', d: 'M12 13v4M8.5 20h7' },
    ],
  },
  compass: {
    filled: false,
    shapes: [
      { tag: 'circle', cx: 12, cy: 12, r: 8 },
      { tag: 'path', d: 'M15.5 8.5l-2 5-5 2 2-5z' },
    ],
  },
  close: { filled: false, shapes: [{ tag: 'path', d: 'M6 6l12 12M18 6L6 18' }] },
  flame: {
    filled: false,
    shapes: [{ tag: 'path', d: 'M12 3c1 3 4.5 4.6 4.5 9a4.5 4.5 0 0 1-9 0c0-2 .9-3.3 2.2-4.3 0 1.6.8 2.5 1.6 2.7C11 7.8 11 5.4 12 3z' }],
  },
  bolt: { filled: false, shapes: [{ tag: 'path', d: 'M13 2.5L4.5 13.5h6.2l-1.2 8 8.5-11h-6.2z' }] },
  map: {
    filled: false,
    shapes: [
      { tag: 'path', d: 'M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z' },
      { tag: 'path', d: 'M9 4v14M15 6v14' },
    ],
  },
  feed: {
    filled: false,
    shapes: [
      { tag: 'rect', x: 4, y: 4, width: 16, height: 16, rx: 3 },
      { tag: 'path', d: 'M8 9h8M8 13h8M8 17h5' },
    ],
  },
  target: {
    filled: false,
    shapes: [
      { tag: 'circle', cx: 12, cy: 12, r: 8 },
      { tag: 'circle', cx: 12, cy: 12, r: 3.5 },
    ],
  },
  user: {
    filled: false,
    shapes: [
      { tag: 'circle', cx: 12, cy: 8, r: 4 },
      { tag: 'path', d: 'M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6' },
    ],
  },
  chevron: { filled: false, shapes: [{ tag: 'path', d: 'M6 9l6 6 6-6' }] },
  mountain: { filled: false, shapes: [{ tag: 'path', d: 'M3 20l6-11 4 6 2-3 6 8z' }] },
  play: { filled: true, shapes: [{ tag: 'path', d: 'M8 5v14l11-7z' }] },
  article: {
    filled: false,
    shapes: [
      { tag: 'rect', x: 5, y: 4, width: 14, height: 16, rx: 2 },
      { tag: 'path', d: 'M8 8h8M8 12h8M8 16h5' },
    ],
  },
  palette: {
    filled: false,
    shapes: [
      { tag: 'circle', cx: 12, cy: 12, r: 9 },
      { tag: 'path', d: 'M12 3v18M12 8a4 4 0 0 1 0 8' },
    ],
  },
  settings: {
    filled: false,
    shapes: [
      { tag: 'circle', cx: 12, cy: 12, r: 3.2 },
      { tag: 'path', d: 'M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1' },
    ],
  },
}

export function isIconName(value: unknown): value is IconName {
  return typeof value === 'string' && (ICON_NAMES as readonly string[]).includes(value)
}
