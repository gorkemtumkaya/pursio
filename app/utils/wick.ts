// Wick, the Pursio mascot: types and palettes.
// The Pursio name, logo and the Wick mascot are not covered by the code license.
import { MASCOT_SETS } from '#shared/utils/mascot-sets'
 
export type WickTheme = 'trail' | 'boulder' | 'halloween'
/**
 * `cheer` is the happy face with a jump (the unlock moment); the other moods
 * are the faces of the Wick v2 drawings.
 */
export type WickMood = 'idle' | 'cheer' | 'happy' | 'proud' | 'encourage' | 'focus' | 'surprised' | 'think' | 'sleep'
export type WickOutfit =
  | 'none'
  | 'bouldering'
  | 'photography'
  | 'cooking'
  | 'guitar'
  | 'gardening'
  | 'reading'
  | 'explorer'
  /** Crown and medal of a founding member. Never picked by the AI. */
  | 'founding'
 
/** Outfit keys the AI may return in `mascot.set` (everything except 'none'). */
export const WICK_OUTFITS = MASCOT_SETS satisfies readonly WickOutfit[]
 
export interface WickPalette {
  /** Body gradient, top to bottom */
  top: string
  mid: string
  bot: string
  /** Glowing core gradient: center, middle, edge */
  core: string
  inner: string
  edge: string
  /** Eyes, mouth, accessory outlines */
  ink: string
  cheek: string
  tongue: string
  shadow: string
  /** The two colors of the sparks around Wick */
  spark: string
  ember: string
  /** Secondary marks: thinking dots */
  soft: string
}

/**
 * `boulder` holds the colors of the Wick v2 drawings (dev_docs/wick-v2).
 * `trail` and `halloween` keep their own flame colors on the same drawing.
 */
export const WICK_PALETTES: Record<WickTheme, WickPalette> = {
  trail: {
    top: '#FFB25C', mid: '#FF8A4A', bot: '#F2552A', core: '#FFFBE8', inner: '#FFE9B0', edge: '#FFC27A',
    ink: '#16211B', cheek: '#FF8A5C', tongue: '#FF8A8A', shadow: '#16211B', spark: '#F2B33D', ember: '#FF8A4A', soft: '#56635B',
  },
  boulder: {
    top: '#EC7A50', mid: '#D24B2B', bot: '#B8361C', core: '#FFF8EE', inner: '#FDE6CC', edge: '#F7B78F',
    ink: '#2A231E', cheek: '#FF9C7A', tongue: '#FF8A7A', shadow: '#2A231E', spark: '#E3A82B', ember: '#F28A5E', soft: '#8C7B68',
  },
  halloween: {
    top: '#FFA040', mid: '#F27A1E', bot: '#D9500A', core: '#FFF8D8', inner: '#FFE29A', edge: '#FFB85A',
    ink: '#1A0E05', cheek: '#FF8A4A', tongue: '#FF8A6A', shadow: '#000000', spark: '#C9A6FF', ember: '#FFB23E', soft: '#BBA9D6',
  },
}

/** Narrow any string (e.g. from the AI response) to a valid outfit, falling back to 'explorer'. */
export function toWickOutfit(value: string | null | undefined): WickOutfit {
  return (WICK_OUTFITS as readonly string[]).includes(value ?? '') ? (value as WickOutfit) : 'explorer'
}
