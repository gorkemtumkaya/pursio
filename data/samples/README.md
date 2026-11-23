# Sample paths

The files in this folder are the content of the public sample pages `/try/photography`, `/try/guitar` and `/try/birdwatching` (spec: `.kiro/specs/sample-path/`). They are imported at build time.

Do not edit them by hand. They are written from the export `data/sample-paths.json` by a script, and the next run would overwrite a hand edit.

## Refresh the samples

When a new export is available (for example with more videos):

1. Replace `data/sample-paths.json` with the new export.
2. Run `yarn samples`. It prints which files were written, updated or unchanged. If the export is broken, it writes nothing and lists what to fix.
3. Run `yarn test`. `tests/unit/sample-files.test.ts` checks every file: 3 quests per skill, unique skill ids, valid video ids and thumbnails, and no dash characters in the path text.
4. Check the new videos on the page (manual row C5 of the spec's design).

`git diff data/samples` shows exactly what the new export changed.

## Shape

```
{ slug, hobby, mascot, finish,
  sections: [ { level, name,
    skills: [ { id, title, desc, milestone, quests: [3 strings],
                videos: [ { id, title, channel, durationSeconds, thumbnailUrl } ] } ] } ] }
```

The number of sections and skills is free; the page counts them. `videos` may be empty.
