const BEARER = /^bearer +(\S+)$/i

/**
 * The token of an `Authorization: Bearer <token>` header. The scheme is not
 * case-sensitive. A missing header, another scheme, no token or anything after
 * the token gives `null`.
 */
export function parseBearer(header: string | null | undefined): string | null {
  if (typeof header !== 'string') return null
  return BEARER.exec(header)?.[1] ?? null
}

export function bearerHeader(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` }
}
