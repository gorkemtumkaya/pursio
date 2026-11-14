// Live check of the x-goog-api-key header transport. Prints only status and response shape.
const key = process.env.NUXT_YOUTUBE_API_KEY
if (!key) {
  console.log('NUXT_YOUTUBE_API_KEY is not set in the process environment')
  process.exit(2)
}
const params = new URLSearchParams({ part: 'snippet,contentDetails,statistics,status', id: 'dQw4w9WgXcQ' })
try {
  const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params}`, {
    headers: { 'x-goog-api-key': key, 'accept': 'application/json' },
    signal: AbortSignal.timeout(10_000),
  })
  console.log('status', res.status)
  const body = await res.json().catch(() => null)
  if (res.ok && body && Array.isArray(body.items)) {
    const item = body.items[0] ?? {}
    console.log('items', body.items.length)
    console.log('item keys', Object.keys(item).join(','))
    console.log('duration present', typeof item.contentDetails?.duration === 'string')
    console.log('embeddable type', typeof item.status?.embeddable)
  }
  else if (body?.error) {
    console.log('error code', body.error.code, 'reason', body.error.errors?.[0]?.reason ?? 'n/a')
  }
}
catch (err) {
  console.log('request failed', err instanceof Error ? err.name : 'unknown')
}
