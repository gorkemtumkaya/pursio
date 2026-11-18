// Every string a visitor can read or hear on the Landing_Page and the Legal_Pages
// (spec: landing-page). Components import from here, so one test can check the
// copy over all of it. The text follows the design in dev_docs ("Landing page"),
// which states the founding member price and plan (owner decision, 2026-11-18).

/** Page title, with a middle dot (not a dash). Req 12.1. */
export const LANDING_TITLE = 'Pursio · Type a hobby. Get a path.'

/** Meta and Open Graph description (Req 12.2, Assumption 18). */
export const LANDING_DESCRIPTION =
  'Pursio turns any hobby into a clear path of small skills, with quests, XP and new videos picked for where you are.'

export const LANDING_COPY = {
  // Header
  brandName: 'Pursio',
  headerNavLabel: 'Page',
  navHow: 'How it works',
  navWick: 'Meet Wick',
  navFounding: 'Founding members',
  navFaq: 'FAQ',
  openApp: 'Open the app',

  // Hero
  heroBadge: 'FREE TO TRY · NO SIGNUP NEEDED',
  headline: 'Turn any hobby into a path you can actually follow.',
  subline:
    'Type a hobby and Pursio builds your skill path: what to learn, in what order, with small quests and fresh videos for every step.',
  hobbyLabel: 'WHAT DO YOU WANT TO GET BETTER AT?',
  hobbyPlaceholder: 'Type any hobby…',
  buildMyPath: 'Build my path',
  emptyHobby: 'Type a hobby to start.',
  chipsLabel: 'Try:',
  heroNote: 'Your first path takes about 15 seconds.',

  // Path preview (decorative, hidden from assistive technology)
  previewEyebrow: 'SECTION 1 · BEGINNER',
  previewSection: 'First sessions',
  previewCount: '2/7',
  previewBubble: 'Footwork is next!',

  // How it works
  howEyebrow: 'HOW IT WORKS',
  howItWorksHeading: 'From “where do I start?” to “what’s next?”',

  // Meet Wick
  wickEyebrow: 'YOUR COMPANION',
  wickHeading: 'Meet Wick, who lights the next step.',
  wickText:
    'Wick is a little lantern spirit who walks the path with you. It dresses for your hobby, cheers when you finish a skill, and gets sleepy when you’ve been away too long.',

  // Founding members. The offer is a waitlist: nobody pays on this page.
  foundingBadge: 'FOUNDING MEMBER · FIRST 50 ONLY',
  foundingHeading: 'Back Pursio early. Keep Plus for life.',
  foundingPrice: '$19',
  foundingPriceUnit: 'one-time',
  foundingPriceLater: '· $29 after the first 50',
  foundingCta: 'Join the founding waitlist',
  foundingDone: 'You’re on the founding waitlist. Wick will be in touch.',
  foundingNote:
    'No payment today. Join the waitlist and we’ll email you when founding spots open. 30-day refund once you buy, no questions asked.',
  followHeading: 'Not ready? Just follow along.',
  followText:
    'Pursio is free to use. Leave your email and you’ll hear when new hobbies and features land. No spam.',
  followCta: 'Keep me posted',
  followDone: 'You’re on the list. Wick will be in touch.',
  emailLabel: 'EMAIL',
  emailPlaceholder: 'you@example.com',
  emailInvalid: 'Type a valid email address.',
  emailBusy: 'Too many tries. Wait a while and try again.',
  emailFailed: 'Could not save that. Try again.',

  // FAQ
  faqHeading: 'Questions',

  // Footer
  footerNavLabel: 'Footer',
  copyright: '© 2026 Pursio',
  privacy: 'Privacy',
  terms: 'Terms',
  refund: 'Refund',
  sourceCode: 'Source code',
  contact: 'Contact',

  // Legal pages (Req 10)
  backToPursio: 'Back to Pursio',
} as const satisfies Readonly<Record<string, string>>

/** The three How_It_Works steps, in order. */
export const LANDING_STEPS: readonly { title: string; line: string }[] = [
  {
    title: 'Type a hobby',
    line: 'Bouldering, film photography, chess, sourdough. Tell Pursio where you are now, and it maps the skills in the order people really learn them.',
  },
  {
    title: 'Do small quests',
    line: 'Every skill comes with three concrete things to try in your next session, so you always know what to do today.',
  },
  {
    title: 'Watch yourself level up',
    line: 'Finish skills to earn XP, unlock the next ones and keep your streak. Fresh videos and articles arrive for the skill you’re on.',
  },
]

/** Example hobby chips under the hero input, in this order. A click fills the input. */
export const EXAMPLE_HOBBIES = ['bouldering', 'film photography', 'guitar', 'chess'] as const

export type ExampleHobby = (typeof EXAMPLE_HOBBIES)[number]

export interface PreviewNode {
  title: string
  sub: string
  state: 'done' | 'current' | 'locked'
  /** Horizontal offset of the node center from the card center, in px. */
  dx: number
}

/** The four nodes of the hero path preview. */
export const PREVIEW_NODES: readonly PreviewNode[] = [
  { title: 'Gear basics', sub: 'Done', state: 'done', dx: -40 },
  { title: 'Reading grades', sub: 'Done', state: 'done', dx: -90 },
  { title: 'Footwork basics', sub: 'In progress · 1/3', state: 'current', dx: -120 },
  { title: 'Body positioning', sub: 'Locked', state: 'locked', dx: -90 },
]

/** The three Wick outfits of the Meet Wick section. */
export const WICK_SHOWCASE = [
  { outfit: 'photography', mood: 'idle', label: 'Photography' },
  { outfit: 'guitar', mood: 'cheer', label: 'Guitar' },
  { outfit: 'cooking', mood: 'idle', label: 'Cooking' },
] as const

/** Founding member perks, in order. */
export const FOUNDING_PERKS: readonly string[] = [
  'Lifetime Pursio Plus when it launches, with nothing more to pay',
  'A founder badge on your profile',
  'An exclusive outfit for Wick',
  'A vote on which hobbies and features come next',
]

export interface FaqItem {
  question: string
  answer: string
}

/** FAQ in order, as in the design. Founding answers are worded for the waitlist. */
export const FAQ_ITEMS: readonly FaqItem[] = [
  {
    question: 'Is Pursio free?',
    answer:
      'Yes. You can build paths, do quests and track your progress for free, and you don’t need an account to try it. Pursio Plus will add extras later.',
  },
  {
    question: 'What do founding members get?',
    answer:
      'The full free app, a founder badge on your profile, an exclusive outfit for Wick and a vote on what we build next. Plus features unlock for you automatically as they ship, with nothing more to pay. Founding spots are not open yet: join the waitlist and we’ll email you first.',
  },
  {
    question: 'Which hobbies does it work for?',
    answer:
      'Anything you can practice and get better at: sports, crafts, music, games, cooking and more. If Pursio doesn’t recognise something, it will tell you and suggest alternatives.',
  },
  {
    question: 'Where does the content come from?',
    answer:
      'Pursio links to videos and articles from across the web and credits the source. It never copies their content; you read or watch on the original site.',
  },
  {
    question: 'Can I get a refund?',
    answer: 'Yes. Founding members can ask for a full refund within 30 days, no questions asked.',
  },
]
