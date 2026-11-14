/**
 * Judge stage: builds the single model input for all candidates and applies the
 * model's verdicts. Pure; the model call itself is made by the pipeline.
 */
import { z } from 'zod'
import type { Level } from '../../../shared/types/skill-tree'
import type { PoolVideo } from '../../../shared/types/video'
import { normalizeText } from '../../../shared/utils/video-normalize'
import type { VideoDetails } from './provider'

export const DESCRIPTION_MAX_CHARS = 500
export const MIN_TEACHES_THIS_SKILL = 0.5
/** When no video reaches MIN_TEACHES_THIS_SKILL, the best instructional videos at or above this are kept. */
export const RELAXED_TEACHES_THIS_SKILL = 0.3
export const RELAXED_MAX_KEPT = 3

export const judgeVerdictSchema = z.object({
  video_id: z.string(),
  teaches_this_skill: z.number().min(0).max(1),
  level_fit: z.number().min(0).max(1),
  is_instruction: z.boolean(),
  style: z.enum(['drill', 'technique', 'explainer', 'approachable']),
  best_matching_quest_text: z.string().nullable(),
})

export const judgeOutputSchema = z.object({ verdicts: z.array(judgeVerdictSchema) })

export type JudgeOutput = z.infer<typeof judgeOutputSchema>

export interface JudgeContext {
  hobby: string
  skillTitle: string
  skillDescription: string
  /** Quest texts only: no index, no id. */
  questTexts: readonly string[]
  level: Level
}

/** First 500 characters (by code point); shorter text is unchanged. */
function truncateDescription(text: string): string {
  const chars = Array.from(text)
  return chars.length <= DESCRIPTION_MAX_CHARS ? text : chars.slice(0, DESCRIPTION_MAX_CHARS).join('')
}

/** Builds the user message for the Judge: skill context plus every candidate. */
export function buildJudgeInput(ctx: JudgeContext, candidates: readonly VideoDetails[]): string {
  const payload = {
    hobby: ctx.hobby,
    skill: { title: ctx.skillTitle, description: ctx.skillDescription },
    quests: [...ctx.questTexts],
    level: ctx.level,
    candidates: candidates.map(c => ({
      video_id: c.id,
      title: c.title,
      description: truncateDescription(c.description),
      channel: c.channel,
      duration_seconds: c.durationSeconds,
    })),
  }
  return JSON.stringify(payload)
}

/** Numbers only, for the empty-pool log line. */
export interface VerdictStats {
  /** Candidates that got a verdict. */
  judged: number
  instructional: number
  /** Highest teaches_this_skill among instructional candidates, or null. */
  best: number | null
}

export type ApplyVerdictsResult = { ok: true, kept: PoolVideo[], stats: VerdictStats } | { ok: false }

/**
 * Validates the whole response, then keeps instructional candidates that teach
 * the skill. Invalid output discards everything (`ok: false`).
 */
export function applyVerdicts(
  output: unknown,
  candidates: readonly VideoDetails[],
  questTexts: readonly string[],
): ApplyVerdictsResult {
  const parsed = judgeOutputSchema.safeParse(output)
  if (!parsed.success) return { ok: false }

  // First verdict per video id wins; entries for unknown ids are never looked up.
  const verdicts = new Map<string, JudgeOutput['verdicts'][number]>()
  for (const v of parsed.data.verdicts) {
    if (!verdicts.has(v.video_id)) verdicts.set(v.video_id, v)
  }

  const questByNormalized = new Map<string, string>()
  for (const q of questTexts) {
    const key = normalizeText(q)
    if (!questByNormalized.has(key)) questByNormalized.set(key, q)
  }

  const instructional = candidates.flatMap((c) => {
    const v = verdicts.get(c.id)
    return v && v.is_instruction ? [{ c, v }] : []
  })
  let chosen = instructional.filter(({ v }) => v.teaches_this_skill >= MIN_TEACHES_THIS_SKILL)
  if (chosen.length === 0) {
    // Nothing passed the strict bar: keep the closest few rather than an empty pool.
    chosen = instructional
      .filter(({ v }) => v.teaches_this_skill >= RELAXED_TEACHES_THIS_SKILL)
      .sort((a, b) => b.v.teaches_this_skill - a.v.teaches_this_skill)
      .slice(0, RELAXED_MAX_KEPT)
  }

  const kept: PoolVideo[] = []
  for (const { c, v } of chosen) {
    kept.push({
      id: c.id,
      title: c.title,
      channel: c.channel,
      thumbnailUrl: c.thumbnailUrl,
      durationSeconds: c.durationSeconds ?? 0,
      viewCount: c.viewCount,
      likeCount: c.likeCount,
      publishedAt: c.publishedAt,
      defaultAudioLanguage: c.defaultAudioLanguage,
      hasCaptions: c.hasCaptions,
      teachesThisSkill: v.teaches_this_skill,
      levelFit: v.level_fit,
      style: v.style,
      matchedQuestText: v.best_matching_quest_text === null
        ? null
        : (questByNormalized.get(normalizeText(v.best_matching_quest_text)) ?? null),
    })
  }
  const judged = candidates.filter((c) => verdicts.has(c.id)).length
  const best = instructional.reduce<number | null>(
    (max, { v }) => (max === null || v.teaches_this_skill > max ? v.teaches_this_skill : max),
    null,
  )
  return { ok: true, kept, stats: { judged, instructional: instructional.length, best } }
}
