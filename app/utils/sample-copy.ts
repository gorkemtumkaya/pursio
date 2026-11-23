// Every fixed text of the sample path page (spec: sample-path, Requirement 13).
// No dash or hyphen character in any string; tests/unit/sample-copy.test.ts checks it.

export const SAMPLE_COPY = {
  /** The tab title: "<Hobby> sample path · Pursio" (Req 1.9). */
  pageTitle: (hobby: string): string => `${hobby} sample path · Pursio`,
} as const
