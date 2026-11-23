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
  /**
   * Lines a main node title may take before it is cut. Absent: 3, as on the path screen. The
   * sample page uses 5, so a finish line title of up to about 50 characters shows in full at 360 px.
   * Five lines (about 106 px with the status) still clear the next label, 112 px below.
   */
  titleLines?: 3 | 4 | 5
}
