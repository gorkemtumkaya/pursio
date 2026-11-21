// Paddle webhook source allowlist. The list comes from Paddle's /ips endpoint
// (`data.ipv4_cidrs`) and is never hard-coded: Paddle can change it.

/** `https://api.paddle.com/ips` for live, `https://sandbox-api.paddle.com/ips` for sandbox. */
export function paddleIpsUrl(environment: 'sandbox' | 'production'): string {
  return environment === 'production' ? 'https://api.paddle.com/ips' : 'https://sandbox-api.paddle.com/ips'
}

/** The IPv4 address as a 32-bit number, or null. Accepts the IPv4-mapped IPv6 form `::ffff:1.2.3.4`. */
function ipv4ToNumber(raw: string): number | null {
  const ip = raw.trim().replace(/^::ffff:/i, '')
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  let value = 0
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null
    const n = Number(part)
    if (n > 255) return null
    value = value * 256 + n
  }
  return value
}

/** Whether `ip` is inside any of the IPv4 CIDRs (e.g. `34.237.3.244/32`). Malformed entries match nothing. */
export function ipInCidrs(ip: string, cidrs: readonly string[]): boolean {
  const address = ipv4ToNumber(ip)
  if (address === null) return false
  return cidrs.some((cidr) => {
    const [base, bitsText = '32'] = cidr.split('/')
    const network = base === undefined ? null : ipv4ToNumber(base)
    const bits = Number(bitsText)
    if (network === null || !Number.isInteger(bits) || bits < 0 || bits > 32) return false
    const size = 2 ** (32 - bits)
    return Math.floor(address / size) === Math.floor(network / size)
  })
}

/** `data.ipv4_cidrs` of an /ips response; throws when the shape is wrong or the list is empty. */
export function parseIpsResponse(body: unknown): string[] {
  const data: unknown = typeof body === 'object' && body !== null ? (body as Record<string, unknown>).data : undefined
  const cidrs: unknown = typeof data === 'object' && data !== null ? (data as Record<string, unknown>).ipv4_cidrs : undefined
  if (!Array.isArray(cidrs)) throw new Error('paddle_ips_invalid')
  const list = cidrs.filter((c): c is string => typeof c === 'string' && /^\d{1,3}(\.\d{1,3}){3}\/\d{1,2}$/.test(c))
  if (list.length === 0) throw new Error('paddle_ips_empty')
  return list
}

/**
 * The caller's IP. On Vercel, `x-real-ip` and `x-forwarded-for` are set by the
 * platform (a client value is overwritten), so they are the source address.
 * Through a local tunnel such as ngrok, `x-forwarded-for` carries it too.
 */
export function sourceIp(headers: { realIp?: string; forwardedFor?: string; remote?: string }): string | null {
  const real = headers.realIp?.trim()
  if (real) return real
  const forwarded = headers.forwardedFor?.split(',')[0]?.trim()
  if (forwarded) return forwarded
  return headers.remote?.trim() || null
}

/** Fetches and caches the list. A failed refresh keeps the last good list; with none, it throws. */
export function createPaddleIpList(options: {
  fetchJson: (url: string) => Promise<unknown>
  now: () => number
  ttlMs: number
}) {
  const cache = new Map<string, { cidrs: string[]; at: number }>()
  return async function allowedCidrs(environment: 'sandbox' | 'production'): Promise<string[]> {
    const url = paddleIpsUrl(environment)
    const hit = cache.get(url)
    if (hit && options.now() - hit.at < options.ttlMs) return hit.cidrs
    try {
      const cidrs = parseIpsResponse(await options.fetchJson(url))
      cache.set(url, { cidrs, at: options.now() })
      return cidrs
    } catch (error) {
      if (hit) return hit.cidrs
      throw error
    }
  }
}
