// Text of the Privacy, Terms and Refund pages (spec: landing-page, Req 10).
// Every statement about data matches what the code does on 2026-11-21.
// DRAFT 2026-11-21 (Paddle): Plus, founding membership, Paddle as merchant of record, cancellation
// and refunds were added for the owner to review before release. When
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

export const LEGAL_UPDATED = 'Last updated: 21 November 2026'
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
        'Your purchases: if you buy Plus or a founding membership, Paddle tells Pursio your Paddle customer id, the email you bought with, what you bought, the status and renewal dates of a subscription, and the totals of your payments. Pursio never receives or stores your card or bank details.',
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
        'To unlock Plus and the founding member perks for your account, and to show your plan in Settings.',
        'To email you about founding spots, Plus or product news, only if you joined a list.',
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
        'Paddle (Paddle.com Market Ltd) sells Plus and founding membership as the merchant of record. If you buy, Paddle receives your email, country, payment details and order, and handles payment, tax, invoices and refunds under its own privacy policy. On the pricing page, Paddle’s script also receives your IP address to show prices in your currency.',
      ],
    },
    {
      heading: 'How long Pursio keeps it',
      paragraphs: [
        'Pursio keeps your account data until you delete your account. Waitlist emails are kept until you ask to be removed, or until the list is no longer needed. Records of purchases are kept as long as tax and accounting law requires, also after you delete your account.',
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
      heading: 'Free app, Plus and founding membership',
      paragraphs: [
        'The core app is free. The free plan includes up to 3 active hobbies at a time: archived hobbies do not count, and archiving one makes room for another. Plus and founding membership have no limit on hobbies. Pursio Plus is an optional subscription for $4.99 a month or $29.99 a year. Founding membership is an optional single payment of $19.99. The price you pay is shown at checkout, in your currency and with the tax for your country.',
      ],
    },
    {
      heading: 'Founding membership',
      items: [
        'Founding membership is one payment of $19.99. It is not a subscription: it does not renew, and nothing more is charged.',
        'It is offered to the first 50 buyers only. When 50 memberships are sold, the offer ends.',
        'A founding member gets a founder badge on their profile, the Founding Wick outfit and a vote on which hobbies and features come next.',
        'A founding member also gets Pursio Plus for life, with nothing more to pay. “For life” means for as long as Pursio offers Plus. It covers the Plus plan as it changes over time, not other products that may be sold separately.',
        'A membership belongs to the account that bought it. It cannot be transferred, shared or resold.',
        'Refunds are described on the Refund page.',
      ],
    },
    {
      heading: 'Who sells Plus and founding membership',
      paragraphs: [
        'Our order process is conducted by our online reseller Paddle.com. Paddle.com is the Merchant of Record for all our orders. Paddle provides all customer service inquiries and handles returns. Paddle’s buyer terms apply to your purchase as well.',
      ],
    },
    {
      heading: 'Plus: free trial, renewal and cancellation',
      items: [
        'A new subscription starts with a 7-day free trial. You enter a payment method at the start, and nothing is charged until the trial ends.',
        'If you do not cancel during the trial, the first payment is taken when it ends. After that, the subscription renews and is paid in advance every month or every year, until you cancel.',
        'You can cancel at any time in Settings, under Subscription, with “Manage subscription”, or from the link in any Paddle email. Plus stays on until the end of the period you paid for and does not renew after that.',
        'If a payment fails, Paddle tries again for a while. Plus stays on during that time; if the payment cannot be taken, the subscription ends.',
        'If the price changes, you are told by email before your next renewal, and you can cancel before it applies.',
        'Refunds are described on the Refund page.',
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
  intro: 'Pursio Plus and founding membership are sold by Paddle, our merchant of record. This page says how to cancel Plus and how to get your money back for either.',
  sections: [
    {
      heading: 'Founding membership',
      paragraphs: [
        'Founding membership is a single payment. If you buy it and change your mind, you can ask for a full refund within 30 days of buying, with no questions asked.',
        'After a refund, the founder badge, the Founding Wick outfit and lifetime Plus end. The free app keeps working. There is nothing to cancel, because a founding membership does not renew.',
      ],
    },
    {
      heading: 'Plus: free trial',
      paragraphs: [
        'Plus starts with a 7-day free trial. Cancel before it ends and you are never charged.',
      ],
    },
    {
      heading: 'Plus: cancel at any time',
      paragraphs: [
        'Cancel in Settings, under Subscription, with “Manage subscription”, or from the link in any Paddle email. Plus stays on until the end of the period you paid for, then it ends and is not charged again. The free app keeps working.',
      ],
    },
    {
      heading: 'Plus: 30-day refund',
      paragraphs: [
        'If you change your mind, you can ask for a full refund of a Plus payment within 30 days of that payment, with no questions asked. This applies to monthly and yearly plans.',
      ],
    },
    {
      heading: 'How to ask',
      paragraphs: [
        `Write to ${CONTACT_EMAIL} from the email address you bought with, or contact Paddle through paddle.net or the link in your receipt. Paddle sends the money back to the payment method you used. After a refund, what you bought ends; the free app keeps working.`,
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
