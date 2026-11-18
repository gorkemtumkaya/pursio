/** Attribute on <html> that makes `/` open on the loading state (Req 1.7). */
export const PATH_HINT_ATTR = 'data-path-hint'

/**
 * Same values as ACTIVE_HOBBY_KEY (app/utils/active-hobby.ts) and
 * HOBBY_LIBRARY_KEY (app/utils/hobby-store.ts). Kept as literals because
 * nuxt.config.ts cannot import from app/; a unit test keeps them equal.
 */
export const PATH_HINT_KEYS = ['pursio-active-hobby:v1', 'pursio-hobbies:v1'] as const

/**
 * Req 1.3, 1.5, 1.7: true when `/` should open on the loading state.
 * `/?landing=1` never has a hint. A storage read that throws counts as no hint.
 */
export function hasPathHint(read: (key: string) => string | null, pathname: string, search: string): boolean {
  if (pathname !== '/' || new URLSearchParams(search).get('landing') === '1') return false
  try {
    return PATH_HINT_KEYS.some((key) => {
      const value = read(key)
      return value !== null && value !== ''
    })
  } catch {
    return false
  }
}

/**
 * Inline <head> script with the same rule as hasPathHint, run before first
 * paint (like themeInitScript in nuxt.config.ts). Plain ES5, no dependency.
 * Any error (no storage, no URLSearchParams) leaves the attribute unset.
 */
export const pathHintInitScript = `(function(){try{if(location.pathname!=='/'||new URLSearchParams(location.search).get('landing')==='1')return;var k=${JSON.stringify(PATH_HINT_KEYS)};for(var i=0;i<k.length;i++){var v=localStorage.getItem(k[i]);if(v!==null&&v!==''){document.documentElement.setAttribute(${JSON.stringify(PATH_HINT_ATTR)},'');return}}}catch(e){}})()`
