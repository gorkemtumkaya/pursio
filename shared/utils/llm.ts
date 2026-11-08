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
export function levelInstruction(level: StartLevel): string {
  return `The learner's starting level is: ${LEVEL_LABELS[level].toLowerCase()}. Start the tree at that level.`
}
