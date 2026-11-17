// Wick, the Pursio mascot: types and palettes.
// The Pursio name, logo and the Wick mascot are not covered by the code license.
 
export type WickTheme = 'trail' | 'boulder' | 'halloween'
export type WickMood = 'idle' | 'cheer' | 'think' | 'sleep'
export type WickOutfit =
  | 'none'
  | 'bouldering'
  | 'photography'
  | 'cooking'
  | 'guitar'
  | 'gardening'
  | 'reading'
  | 'explorer'
 
/** Outfit keys the AI may return in `mascot.set` (everything except 'none'). */
export const WICK_OUTFITS = [
  'bouldering',
  'photography',
  'cooking',
  'guitar',
  'gardening',
  'reading',
  'explorer',
] as const satisfies readonly WickOutfit[]
 
export interface WickPalette {
  /** Body gradient, top to bottom */
  top: string
  bot: string
  /** Glowing core gradient */
  core: string
  inner: string
  /** Halo around Wick */
  glow: string
  /** Eyes, mouth */
  ink: string
  cheek: string
  tongue: string
  shadow: string
  spark: string
  /** Secondary marks: z's, thinking dots, music notes */
  soft: string
}
 
export const WICK_PALETTES: Record<WickTheme, WickPalette> = {
  trail: {
    top: '#FFB25C', bot: '#FF6A3D', core: '#FFF6CF', inner: '#FFD27A', glow: '#FFB25C',
    ink: '#16211B', cheek: '#FF4A2E', tongue: '#FF8A8A', shadow: '#16211B', spark: '#F2B33D', soft: '#56635B',
  },
  boulder: {
    top: '#F59A62', bot: '#D9542F', core: '#FFF2D6', inner: '#FFD9A0', glow: '#F5B48E',
    ink: '#2A231E', cheek: '#B8361B', tongue: '#FF8A7A', shadow: '#2A231E', spark: '#E3A82B', soft: '#675A50',
  },
  halloween: {
    top: '#FFA040', bot: '#E85A0C', core: '#FFF2B0', inner: '#FFC85A', glow: '#9B5CFF',
    ink: '#1A0E05', cheek: '#C2410C', tongue: '#FF8A6A', shadow: '#000000', spark: '#C9A6FF', soft: '#BBA9D6',
  },
}
 
/** Narrow any string (e.g. from the AI response) to a valid outfit, falling back to 'explorer'. */
export function toWickOutfit(value: string | null | undefined): WickOutfit {
  return (WICK_OUTFITS as readonly string[]).includes(value ?? '') ? (value as WickOutfit) : 'explorer'
}
