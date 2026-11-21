// Text of the hobby limit card on the new hobby page (free plan: 3 active hobbies).

export const HOBBY_LIMIT_COPY = {
  textWithFounding: 'Archive one to start another, or become a founding member for unlimited hobbies.',
  /** When founding spots are gone, or checkout is not open. */
  textArchiveOnly: 'Archive one to start another.',
  foundingCta: 'Become a founding member',
  manageCta: 'Manage my hobbies',
  checkoutFailed: 'Checkout couldn’t open. Reload the page and try again.',
  wick: 'Your hobby slots are full.',
} as const

/** "You have 3 hobbies going." An account that already has more sees its own number. */
export function hobbyLimitHeading(count: number): string {
  return `You have ${count} hobbies going.`
}
