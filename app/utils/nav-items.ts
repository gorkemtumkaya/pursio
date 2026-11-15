import type { IconName } from './icons'

export interface NavItem {
  key: 'path' | 'fresh' | 'quests' | 'profile'
  /** Visible label, also the accessible name. */
  label: string
  to: string
  icon: IconName
  /** True when the item is shown with the active style. */
  active: boolean
  /** `aria-current` value, or undefined. */
  current: 'page' | 'true' | undefined
}

/**
 * Items of the main navigation in order (spec: fresh, Req 10.1 to 10.5): Path, Fresh,
 * Quests, Profile. Demo_Mode has no account, so Quests and Profile are hidden and Path
 * and Fresh keep the demo (spec: accounts-cloud-save, Req 11.1, 12.6). Only the item of
 * the open page gets `aria-current="page"`. On Settings the sidebar marks its own link;
 * the bottom bar has none, so there Settings marks the Profile item it is opened from.
 */
export function navItems(routePath: string, demo: boolean, variant: 'bottom' | 'side'): NavItem[] {
  const onSettings = routePath === '/settings'
  const onProfile = routePath === '/profile' || (onSettings && variant === 'bottom')
  const onQuests = routePath === '/quests'
  const onFresh = routePath === '/fresh'
  const onPath = !onProfile && !onSettings && !onQuests && !onFresh

  const items: NavItem[] = [
    {
      key: 'path',
      label: 'Path',
      to: demo ? '/path?demo=1' : '/path',
      icon: 'map',
      active: onPath,
      current: onPath ? 'page' : undefined,
    },
    {
      key: 'fresh',
      label: 'Fresh',
      to: demo ? '/fresh?demo=1' : '/fresh',
      icon: 'spark',
      active: onFresh,
      current: onFresh ? 'page' : undefined,
    },
  ]
  if (demo) return items
  items.push(
    {
      key: 'quests',
      label: 'Quests',
      to: '/quests',
      icon: 'target',
      active: onQuests,
      current: onQuests ? 'page' : undefined,
    },
    {
      key: 'profile',
      label: 'Profile',
      to: '/profile',
      icon: 'user',
      active: onProfile,
      current: routePath === '/profile' ? 'page' : onProfile ? 'true' : undefined,
    },
  )
  return items
}
