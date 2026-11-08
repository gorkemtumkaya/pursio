import type { SkillTree } from './skill-tree'
export type Provider = 'anthropic' | 'openai'
export type StartLevel = 'new' | 'some' | 'serious'
export interface ProviderConfig {
  provider: Provider
  model: string
  apiKey: string
}
export type ErrorCode =
  | 'invalid_input'
  | 'not_a_hobby'
  | 'rate_limited'
  | 'timeout'
  | 'generation_failed'
  | 'provider_auth'
  | 'provider_error'
  | 'no_key'
export type TreeResponse = { tree: SkillTree; model: string } | { error: ErrorCode }
export type TestResponse = { ok: true } | { ok: false; error: ErrorCode }
