// Preview_Mode of the path canvas (spec: sample-path, Requirement 5). A page that shows a path it
// does not track (the sample page) passes these texts; without them the canvas shows progress.

export interface PreviewHeader {
  variant: 'banner' | 'divider'
  /** "SECTION 2 · ADVANCED" */
  eyebrow: string
  title: string
  /** Banner only, in place of "done/total skills": "7 skills". */
  countText: string | null
  /** Divider only, in place of the lock line: "Opens after the first milestone". */
  note: string | null
}

export interface CanvasPreview {
  /** Text of the tag above the current node, in place of "NEXT UP". */
  tag: string
  /** Sub label per node id, in place of the progress status. */
  status: Readonly<Record<string, string>>
  /** One per section, in order. */
  headers: readonly PreviewHeader[]
}
