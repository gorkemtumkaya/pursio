/**
 * Fresh Judge stage: builds the single model input for one Fresh_Check and applies
 * the model's verdicts. Pure; the model call itself is made by the Fresh check.
 */
import { z } from 'zod'
import type { Level } from '../../../shared/types/skill-tree'
import type { VideoStyle } from '../../../shared/types/video'
import { normalizeText } from '../../../shared/utils/video-normalize'
import type { VideoDetails } from '../video/provider'
import { MIN_TEACHES_THIS_SKILL, truncateDescription } from '../video/judge'

/** Longest `why` after trimming, in characters (Req 6.4). */
export const WHY_MAX = 120
/** A `why` sharing this many consecutive Normalized words with the source is dropped (Req 6.9). */
export const QUOTE_WORDS = 6
/** Most Skill titles sent to the Judge (Req 6.2). */
export const SKILL_TITLES_MAX = 60

export const freshVerdictSchema = z.object({
  video_id: z.string(),
  skill_title: z.string().nullable(),
  level: z.enum(['beginner', 'intermediate', 'advanced']),
  teaches_this_skill: z.number().min(0).max(1),
  level_fit: z.number().min(0).max(1),
  is_instruction: z.boolean(),
  style: z.enum(['drill', 'technique', 'explainer', 'approachable']),
  why: z.string(),
})

export const freshJudgeOutputSchema = z.object({ verdicts: z.array(freshVerdictSchema) })

export type FreshJudgeOutput = z.infer<typeof freshJudgeOutputSchema>
type FreshVerdict = FreshJudgeOutput['verdicts'][number]

export interface FreshJudgeContext {
  hobby: string
  /** Language_Code of the Check_Key. */
  language: string
  /** Normalized Skill titles, newest pool first. */
  skillTitles: readonly string[]
}

/** A sent video that passed every Fresh Judge rule. */
export interface JudgedFresh {
  video: VideoDetails
  /** The given Normalized Skill title the verdict matched. */
  skillTitle: string
  level: Level
  teachesThisSkill: number
  levelFit: number
  style: VideoStyle
  /** Trimmed Why_Line. */
  why: string
}

export type FreshJudgeResult = { ok: true, kept: JudgedFresh[] } | { ok: false }

/** Normalized, distinct, in given order, at most 60. */
function judgeTitles(titles: readonly string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const t of titles) {
    const n = normalizeText(t)
    if (n === '' || seen.has(n)) continue
    seen.add(n)
    out.push(n)
    if (out.length === SKILL_TITLES_MAX) break
  }
  return out
}

/** Builds the user message for the Fresh Judge: hobby, language, Skill titles and every video. */
export function buildFreshJudgeInput(ctx: FreshJudgeContext, videos: readonly VideoDetails[]): string {
  const payload = {
    hobby: normalizeText(ctx.hobby),
    language: ctx.language,
    skill_titles: judgeTitles(ctx.skillTitles),
    videos: videos.map(v => ({
      video_id: v.id,
      title: v.title,
      description: truncateDescription(v.description),
      channel: v.channel,
      duration_seconds: v.durationSeconds,
    })),
  }
  return JSON.stringify(payload)
}

function words(text: string): string[] {
  const n = normalizeText(text)
  return n === '' ? [] : n.split(' ')
}

/** True when `run` appears as a contiguous run inside `source`. */
function containsRun(source: readonly string[], run: readonly string[]): boolean {
  outer: for (let i = 0; i + run.length <= source.length; i++) {
    for (let j = 0; j < run.length; j++) {
      if (source[i + j] !== run[j]) continue outer
    }
    return true
  }
  return false
}

/**
 * True when the Normalized why shares 6 or more consecutive words with the
 * Normalized title or the full description (decision D5).
 */
export function quotesSource(why: string, title: string, description: string): boolean {
  const w = words(why)
  if (w.length < QUOTE_WORDS) return false
  const t = words(title)
  const d = words(description)
  for (let i = 0; i + QUOTE_WORDS <= w.length; i++) {
    const run = w.slice(i, i + QUOTE_WORDS)
    if (containsRun(t, run) || containsRun(d, run)) return true
  }
  return false
}

function whyValid(why: string): boolean {
  const len = Array.from(why.trim()).length
  return len >= 1 && len <= WHY_MAX
}

/**
 * Validates the whole response, then keeps sent videos that teach one of the
 * given Skills. Invalid output discards everything (`ok: false`, Req 6.5).
 */
export function applyFreshVerdicts(
  output: unknown,
  sent: readonly VideoDetails[],
  skillTitles: readonly string[],
): FreshJudgeResult {
  const parsed = freshJudgeOutputSchema.safeParse(output)
  if (!parsed.success) return { ok: false }
  if (!parsed.data.verdicts.every(v => whyValid(v.why))) return { ok: false }

  const sentIds = new Set(sent.map(v => v.id))
  // Verdicts for ids not sent are ignored; two or more for one id drop that video.
  const byId = new Map<string, FreshVerdict[]>()
  for (const v of parsed.data.verdicts) {
    if (!sentIds.has(v.video_id)) continue
    const list = byId.get(v.video_id)
    if (list) list.push(v)
    else byId.set(v.video_id, [v])
  }

  const titles = new Set(judgeTitles(skillTitles))
  const kept: JudgedFresh[] = []
  const done = new Set<string>()
  for (const video of sent) {
    if (done.has(video.id)) continue
    done.add(video.id)
    const list = byId.get(video.id)
    if (!list || list.length !== 1) continue
    const v = list[0]!
    if (!v.is_instruction || v.teaches_this_skill < MIN_TEACHES_THIS_SKILL) continue
    if (v.skill_title === null) continue
    const title = normalizeText(v.skill_title)
    if (!titles.has(title)) continue
    const why = v.why.trim()
    if (quotesSource(why, video.title, video.description)) continue
    kept.push({
      video,
      skillTitle: title,
      level: v.level,
      teachesThisSkill: v.teaches_this_skill,
      levelFit: v.level_fit,
      style: v.style,
      why,
    })
  }
  return { ok: true, kept }
}
