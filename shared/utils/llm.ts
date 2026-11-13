import type { ErrorCode, Provider, StartLevel } from '../types/llm'
export const PROVIDERS = ['anthropic', 'openai'] as const satisfies readonly Provider[]
export const PROVIDER_LABELS: Record<Provider, string> = { anthropic: 'Anthropic', openai: 'OpenAI' }
/** First entry is the default model for the provider (Req 11.3). */
export const MODEL_PRESETS: Record<Provider, readonly [string, ...string[]]> = {
  anthropic: ['claude-sonnet-4-5', 'claude-haiku-4-5', 'claude-opus-4-1'],
  openai: ['gpt-5-mini', 'gpt-5', 'gpt-4.1-mini'],
}
export const ERROR_CODES = [
  'invalid_input',
  'not_a_hobby',
  'rate_limited',
  'timeout',
  'generation_failed',
  'provider_auth',
  'provider_error',
  'no_key',
  'unauthorized',
  'save_failed',
] as const satisfies readonly ErrorCode[]
/** Request header carrying a User_Config API key. */
export const KEY_HEADER = 'x-llm-api-key'
export const HOBBY_MAX_LENGTH = 60
export const MODEL_MAX_LENGTH = 100
export function isProvider(value: unknown): value is Provider {
  return typeof value === 'string' && (PROVIDERS as readonly string[]).includes(value)
}
export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && (ERROR_CODES as readonly string[]).includes(value)
}
/** trim, collapse inner whitespace runs (/\s+/g) to ' ', toLowerCase (Req 1.3, 1.4). */
export function normalizeHobby(input: string): string {
  return input.trim().replace(/\s+/g, ' ').toLowerCase()
}
export const START_LEVELS = ['new', 'some', 'serious'] as const satisfies readonly StartLevel[]
export const DEFAULT_LEVEL: StartLevel = 'new'
export const LEVEL_LABELS: Record<StartLevel, string> = {
  new: 'New to it',
  some: 'Tried it a bit',
  serious: 'Getting serious',
}
export function isStartLevel(value: unknown): value is StartLevel {
  return typeof value === 'string' && (START_LEVELS as readonly string[]).includes(value)
}
/** What each starting level means for the tree, sent to the model with the hobby. */
const LEVEL_GUIDANCE: Record<StartLevel, string> = {
  new: 'They have never done it. Sections: beginner, intermediate, (optional) advanced. Start from first contact: setup, safety and the very first basics.',
  some: 'They have tried it a few times and know the basic vocabulary, setup and safety. Sections: intermediate, then advanced (beginner only as one short refresher section if the hobby truly needs it). Do not teach first steps; start at the skills that turn a dabbler into a regular.',
  serious: 'They practice regularly and are past the fundamentals. Sections: advanced only (2 or 3 sections, all level "advanced"). No basics, setup or safety-intro nodes; start at refining technique, harder goals and performance.',
}

export function levelInstruction(level: StartLevel): string {
  return `Starting level: ${LEVEL_LABELS[level].toLowerCase()}. ${LEVEL_GUIDANCE[level]}`
}
