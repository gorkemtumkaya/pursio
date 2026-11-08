# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- A bouldering learning path at `/path`: a winding trail of skills in two sections, First sessions and Technique, with an optional side quest and a milestone at the end of each section. (spec: skill-path-ui)
- Tap any skill to see its description and three quests, in a bottom sheet on mobile or a side panel on desktop. (spec: skill-path-ui)
- Mark a skill complete to earn XP, level up and unlock the next skill, with a short unlock moment that celebrates the step. (spec: skill-path-ui)
- Your progress is saved in your browser, so completed skills and XP are still there when you come back. (spec: skill-path-ui)
- The start page now asks what you want to get better at: type a hobby or tap an example, and Pursio builds your skill tree and opens it as your path. (spec: ai-skill-tree-generation)
- Your generated path is kept in your browser, so it is still at `/path` when you come back, and a "Generated with <model>" label shows which AI model built it. (spec: ai-skill-tree-generation)
- A Settings page lets you pick the AI provider and model and use your own API key, which stays in your browser, with a "Test connection" button to check it works. (spec: ai-skill-tree-generation)
- Your streak now counts the real days in a row on which you completed a skill, and stays alive until the end of the next day. (spec: local-progress-data)
- The "This week" card shows which days this week you completed a skill. (spec: local-progress-data)
- Every hobby you build is kept with its own progress: switch between them from the sidebar on desktop or the hobby button on mobile, and use "+ Add a hobby" to build another. (spec: local-progress-data)

### Changed

- Completed skills in the trail and halloween themes use a slightly darker color, so the white text on them is easier to read. (spec: skill-path-ui)
- A path you built before this update moves into your hobby list with its progress. Opening `/path` with no hobbies yet takes you to the start page. (spec: local-progress-data)
- The Fresh, Quests and Profile menu items and the "Fresh this week" cards are hidden until those features exist. The demo at `/path?demo=1` still shows them as samples. (spec: local-progress-data)
- The start page has a new look: Wick reacts while your path is built, and you can say how far along you are in the hobby so the path starts at the right level. (spec: new-hobby-page)