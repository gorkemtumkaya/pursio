// Text of the Privacy, Terms and Refund pages (spec: landing-page, Req 10).
// Every statement about data matches what the code does on 2026-11-18. When
// the app starts to collect, send or sell something new, update this file in
// the same change. Not reviewed by a lawyer.

export interface LegalSection {
  heading: string
  /** Paragraphs shown before the list. */
  paragraphs?: readonly string[]
  /** Bullet list. */
  items?: readonly string[]
}

export interface LegalDocument {
  title: string
  /** One or two sentences under the title. */
  intro: string
  sections: readonly LegalSection[]
}

export const LEGAL_UPDATED = 'Last updated: 18 November 2026'
export const CONTACT_EMAIL = 'hello@pursio.fun'

export const PRIVACY: LegalDocument = {
  title: 'Privacy',
  intro:
    'This page says what Pursio stores about you, why, and who else receives it. Pursio does not sell your data and shows no advertising.',
  sections: [
    {
      heading: 'What Pursio stores',
      items: [
        'Your paths: the hobbies you type, the starting level and goal you choose, and the skill paths built from them.',
        'Your progress: finished skills, ticked quests, XP, streaks and rewards.',
        'Your video activity: videos you watch, save or skip, and the channels you mute.',
        'Your account: when you first open the app, Pursio creates an anonymous account with a random id, so your paths can be saved without a signup. If you sign in with Google or with an email link, Pursio also stores your email address.',
        'Your waitlist email: if you join the founding member waitlist or the updates list, Pursio stores that email address and which list you joined.',
        'Your settings: theme and AI settings. These stay in your browser.',
      ],
    },
    {
      heading: 'What stays in your browser',
      paragraphs: [
        'Pursio keeps a copy of your paths, progress and settings in your browser’s local storage, so the app opens quickly. If you add your own AI provider key in Settings, the key is stored only in your browser. It is sent with a request to build a path and passed on to the provider you chose. Pursio does not save it on its servers.',
        'Pursio sets no advertising cookies. The sign in service and the analytics service keep their own entries in your browser to recognise your session.',
      ],
    },
    {
      heading: 'How Pursio uses it',
      items: [
        'To build your paths and show your progress on every device you sign in on.',
        'To pick videos for the skill you are on.',
        'To find errors and to learn which parts of the app are used.',
        'To email you about founding spots or product news, only if you joined a list.',
      ],
    },
    {
      heading: 'Who else receives data',
      paragraphs: ['Pursio uses these services to run. Each receives only what it needs for its part.'],
      items: [
        'Supabase stores the database and handles sign in.',
        'Vercel hosts the website and runs the server code. Like any web host, it sees your IP address.',
        'Anthropic or OpenAI builds the skill path. The hobby, level and goal you type are sent to the provider. Do not type personal details into the hobby field.',
        'PostHog provides analytics and error reports. It receives the pages you open, the actions you take in the app, errors, and the text sent to and returned by the AI provider. If you are signed in, it also receives your account id and email address.',
        'YouTube plays the videos. Pursio loads the player in its privacy enhanced mode, and Google receives data when you play a video.',
        'Google handles sign in, if you choose to sign in with Google.',
      ],
    },
    {
      heading: 'How long Pursio keeps it',
      paragraphs: [
        'Pursio keeps your account data until you delete your account. Waitlist emails are kept until you ask to be removed, or until the list is no longer needed.',
      ],
    },
    {
      heading: 'Your choices',
      items: [
        'Delete your account in Settings. This removes your account, paths, progress and video activity from the database at once.',
        'Clear your browser’s site data to remove what is stored on your device.',
        `Write to ${CONTACT_EMAIL} to get a copy of your data, to correct it, to leave a waitlist or to ask any question about it.`,
      ],
    },
    {
      heading: 'Changes',
      paragraphs: ['When this page changes, the date at the top changes with it.'],
    },
  ],
}

export const TERMS: LegalDocument = {
  title: 'Terms',
  intro: 'These are the rules for using Pursio. By using the app you agree to them.',
  sections: [
    {
      heading: 'What Pursio is',
      paragraphs: [
        'Pursio turns a hobby into a learning path with skills, small quests and videos. It is an early product: features can change, and the service can be unavailable at times.',
      ],
    },
    {
      heading: 'Paths are made by AI',
      paragraphs: [
        'An AI model writes the skill paths and quests. They can be wrong, incomplete or unsuitable for you. Treat them as suggestions, not as professional instruction.',
        'Some hobbies carry a risk of injury. You are responsible for practising safely: use proper equipment, learn from a qualified instructor where one is needed, and stop when something does not feel safe.',
      ],
    },
    {
      heading: 'Videos and links',
      paragraphs: [
        'Pursio links to videos and articles made by other people and plays videos from YouTube. That content belongs to its owners, and Pursio does not control or check all of it. YouTube’s own terms apply when you watch a video.',
      ],
    },
    {
      heading: 'Your account',
      paragraphs: [
        'You can use Pursio without signing up. Paths kept only in an anonymous account can be lost when you clear your browser or change device; sign in to keep them. You can delete your account in Settings at any time.',
      ],
    },
    {
      heading: 'Fair use',
      items: [
        'Do not use Pursio to break the law or to harm others.',
        'Do not try to overload the service, get around its limits or reach other people’s data.',
        'If you add your own AI provider key, you are responsible for that key and its costs.',
      ],
    },
    {
      heading: 'Free app and founding members',
      paragraphs: [
        'Pursio is free to use today. Founding membership is not on sale yet: joining the waitlist costs nothing and does not oblige you to buy. The price and the terms of purchase will be shown before you pay.',
      ],
    },
    {
      heading: 'Source code and brand',
      paragraphs: [
        'The source code of Pursio is published under the AGPL 3.0 license. The Pursio name, the logo and the Wick mascot are not covered by that license.',
      ],
    },
    {
      heading: 'No warranty',
      paragraphs: [
        'Pursio is provided as it is, without a promise that it is free of errors or always available. As far as the law allows, Pursio is not liable for loss or injury that follows from using the app or from following a path. Nothing here limits rights the law gives you as a consumer.',
      ],
    },
    {
      heading: 'Changes and contact',
      paragraphs: [
        `These terms can change as the product grows. The date at the top shows the latest version. Questions: ${CONTACT_EMAIL}.`,
      ],
    },
  ],
}

export const REFUND: LegalDocument = {
  title: 'Refund',
  intro: 'Pursio is free to use today, and nothing is on sale yet. This page says how refunds will work once founding membership opens.',
  sections: [
    {
      heading: 'Today',
      paragraphs: [
        'You cannot pay for anything in Pursio yet. Joining the founding member waitlist is free and takes no payment details.',
      ],
    },
    {
      heading: 'Founding membership',
      paragraphs: [
        'Founding membership will be a single payment. If you buy it and change your mind, you can ask for a full refund within 30 days of the purchase, with no questions asked.',
      ],
    },
    {
      heading: 'How to ask',
      paragraphs: [
        `Write to ${CONTACT_EMAIL} from the email address you bought with. The money goes back to the payment method you used. After a refund, the founder perks and any paid features end; the free app keeps working.`,
      ],
    },
    {
      heading: 'After 30 days',
      paragraphs: [
        `After 30 days a refund is not automatic. If something went wrong, write to ${CONTACT_EMAIL} anyway. Rights the law gives you as a consumer always apply.`,
      ],
    },
  ],
}
