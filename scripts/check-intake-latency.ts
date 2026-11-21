// Latency check of POST /api/intake (spec: path-intake, task 3, decision 38).
//
// Sends 20 intake calls, one at a time, through the real handler, prompt, schema, request
// settings and Sanitizer, and prints the time of each against the 2 s target.
// It never prints a key, a Note or any text of an answer.
//
// Run from the project root, with the server env loaded into the process:
//   node --env-file=.env ./node_modules/jiti/lib/jiti-cli.mjs scripts/check-intake-latency.ts
// Reads NUXT_LLM_PROVIDER and NUXT_LLM_API_KEY, and the intake model from
// NUXT_LLM_INTAKE_MODEL_ANTHROPIC or NUXT_LLM_INTAKE_MODEL_OPENAI (else the nuxt.config default).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Provider } from '../shared/types/llm'
import { isProvider } from '../shared/utils/llm'
import { handleIntakeRequest } from '../server/utils/intake-handlers'
import { createAnthropicAdapter } from '../server/utils/providers/anthropic'
import { createOpenAIAdapter } from '../server/utils/providers/openai'
import type { Fetcher } from '../server/utils/providers/types'

const TARGET_MS = 2_000
const LIMIT_MS = 5_000
const DEFAULT_MODELS: Record<Provider, string> = { anthropic: 'claude-haiku-5-5', openai: 'gpt-5-mini' }

const CASES: { hobby: string; note: string; language: string }[] = [
  { hobby: 'guitar', note: '', language: 'en' },
  { hobby: 'bouldering', note: '', language: 'en' },
  { hobby: 'guitar', note: 'Played a bit as a teen. I just want to play songs I like at home, not into performing.', language: 'en' },
  { hobby: 'sandwich making', note: 'Mostly for lunch. I like spicy stuff.', language: 'en' },
  { hobby: 'sourdough baking', note: 'Never baked bread. I want a loaf with a good crust for weekends. No dairy.', language: 'en' },
  { hobby: 'film photography', note: 'I shoot digital every week, new to film. I want to develop my own black and white rolls.', language: 'en' },
  { hobby: 'chess', note: 'I know the rules and play online sometimes. I want to stop blundering pieces.', language: 'en' },
  { hobby: 'pottery', note: 'Took one class years ago. I want to make a set of mugs. Not into glazing chemistry.', language: 'en' },
  { hobby: 'trail running', note: 'I run 5k on roads twice a week. Goal: finish a 20k trail race in spring.', language: 'en' },
  { hobby: 'watercolor', note: 'Total beginner. I like loose botanical styles, not portraits.', language: 'en' },
  {
    hobby: 'calligraphy',
    // A long Note, about 320 characters.
    note: 'I did some brush lettering during lockdown, mostly copying alphabets from videos, and then stopped. '
      + 'My sister is getting married next summer and I would love to write the invitations and the place cards by hand. '
      + 'I like modern loose styles more than strict copperplate. I do not want to spend money on expensive nibs yet.',
    language: 'en',
  },
  { hobby: 'gardening', note: 'Small balcony, no garden. I want herbs and tomatoes I can actually eat.', language: 'en' },
  { hobby: 'gitar', note: 'Gençken biraz çaldım. Sadece evde sevdiğim şarkıları çalmak istiyorum, sahneye çıkmak istemem.', language: 'tr' },
  { hobby: 'ekmek yapımı', note: 'Hiç ekmek yapmadım. Hafta sonları için çıtır kabuklu bir ekmek istiyorum.', language: 'tr' },
  { hobby: 'Klettern', note: 'Ich bouldere seit einem Jahr. Ich will sauberer klettern, Wettkämpfe interessieren mich nicht.', language: 'de' },
  { hobby: 'Kochen', note: 'Ich koche selten. Schnelle vegetarische Gerichte unter der Woche wären toll.', language: 'de' },
  { hobby: 'fotografía', note: 'Tengo una cámara nueva y no sé usar el modo manual. Quiero fotos de viajes.', language: 'es' },
  { hobby: 'ganchillo', note: 'Mi abuela me enseñó de niña. Quiero tejer una manta para el sofá.', language: 'es' },
  { hobby: '書道', note: '小学校以来やっていません。年賀状を自分で書けるようになりたいです。', language: 'ja' },
  { hobby: 'ピアノ', note: '子供の頃に少し習いました。好きなアニメの曲を弾きたいです。', language: 'ja' },
]

function env(name: string): string {
  return process.env[name]?.trim() ?? ''
}

const provider = env('NUXT_LLM_PROVIDER')
const apiKey = env('NUXT_LLM_API_KEY')
if (!isProvider(provider) || apiKey === '') {
  console.log('NUXT_LLM_PROVIDER and NUXT_LLM_API_KEY must be set in the process environment')
  process.exit(2)
}
const model = env(provider === 'anthropic' ? 'NUXT_LLM_INTAKE_MODEL_ANTHROPIC' : 'NUXT_LLM_INTAKE_MODEL_OPENAI') || DEFAULT_MODELS[provider]

/** What the last provider response said about its length, read from known fields only. */
let lastUsage: { outputTokens: number | null; cutOff: boolean } = { outputTokens: null, cutOff: false }

function readUsage(response: unknown): typeof lastUsage {
  if (typeof response !== 'object' || response === null) return { outputTokens: null, cutOff: false }
  const r = response as Record<string, unknown>
  const usage = (typeof r.usage === 'object' && r.usage !== null ? r.usage : {}) as Record<string, unknown>
  const tokens = typeof usage.output_tokens === 'number' ? usage.output_tokens
    : typeof usage.completion_tokens === 'number' ? usage.completion_tokens : null
  const firstChoice = Array.isArray(r.choices) ? (r.choices[0] as Record<string, unknown> | undefined) : undefined
  const cutOff = r.stop_reason === 'max_tokens' || firstChoice?.finish_reason === 'length'
  return { outputTokens: tokens, cutOff }
}

const fetcher: Fetcher = async (url, request) => {
  const response = await fetch(url, {
    method: request.method,
    headers: request.headers,
    body: JSON.stringify(request.body),
    signal: request.signal,
  })
  // Only the status is kept on failure: a provider error body can echo part of the key.
  if (!response.ok) throw { status: response.status }
  const body: unknown = await response.json()
  lastUsage = readUsage(body)
  return body
}

const prompt = readFileSync(fileURLToPath(new URL('../server/prompts/intake.md', import.meta.url)), 'utf8')

const deps = {
  adapters: { anthropic: createAnthropicAdapter(fetcher), openai: createOpenAIAdapter(fetcher) },
  systemPrompt: async () => prompt,
  defaults: { provider, model: '', apiKey },
  smallModels: { anthropic: model, openai: model },
  maxTokens: { anthropic: 1200, openai: 2000 },
  openaiReasoningEffort: env('NUXT_LLM_INTAKE_REASONING_EFFORT_OPENAI') || 'minimal',
  limiter: { tryConsume: () => true },
  verifyToken: async () => 'latency-check',
  // Long enough to measure slow calls instead of cutting them at 5 s.
  deadlineMs: 30_000,
  now: () => performance.now(),
}

console.log(`provider ${provider}, model ${model}, ${CASES.length} calls, target ${TARGET_MS} ms`)
const times: number[] = []
let accepted = 0
let cutOff = 0
for (const [index, item] of CASES.entries()) {
  lastUsage = { outputTokens: null, cutOff: false }
  const started = performance.now()
  const result = await handleIntakeRequest(
    { body: item, headerKey: undefined, authorization: 'Bearer latency-check' },
    deps,
  )
  const ms = Math.round(performance.now() - started)
  times.push(ms)
  const ok = result.status === 200
  if (ok) accepted += 1
  if (lastUsage.cutOff) cutOff += 1
  const outcome = ok ? 'accepted' : `status ${result.status} ${'error' in result.body ? result.body.error : ''}`
  console.log(
    `${String(index + 1).padStart(2)}  ${item.language}  ${String(ms).padStart(5)} ms  ` +
      `out ${lastUsage.outputTokens ?? '?'} tokens${lastUsage.cutOff ? ' CUT OFF' : ''}  ${outcome}`,
  )
}

const sorted = [...times].sort((a, b) => a - b)
const median = sorted.length % 2 === 1
  ? sorted[(sorted.length - 1) / 2] ?? 0
  : Math.round(((sorted[sorted.length / 2 - 1] ?? 0) + (sorted[sorted.length / 2] ?? 0)) / 2)
const overTarget = times.filter(ms => ms > TARGET_MS).length
const overLimit = times.filter(ms => ms > LIMIT_MS).length
console.log('')
console.log(`median ${median} ms, slowest ${sorted.at(-1) ?? 0} ms`)
console.log(`over ${TARGET_MS} ms: ${overTarget}, over ${LIMIT_MS} ms: ${overLimit}, cut off: ${cutOff}, accepted: ${accepted}/${times.length}`)
const pass = times.length - overTarget >= 18 && overLimit === 0 && cutOff === 0 && accepted === times.length
console.log(pass ? 'PASS' : 'FAIL (see task 3.2 for what to try)')
process.exit(pass ? 0 : 1)
