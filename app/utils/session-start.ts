/**
 * Whether opening this route may start a session (spec: accounts-cloud-save, Req 3.1, 12.1).
 * False in Demo_Mode (`/path?demo=1`, `/fresh?demo=1`; spec: fresh, decision D13) and on every
 * sample page (spec: sample-path, Req 3.1, 3.2: no cost before intent). A sample page is
 * decided by its path alone, so a stored session or an account changes nothing (Req 3.7).
 */
export function startsSession(path: string, query: Readonly<Record<string, unknown>>): boolean {
  if ((path === '/path' || path === '/fresh') && query.demo === '1') return false
  if (path === '/try' || path.startsWith('/try/')) return false
  return true
}
