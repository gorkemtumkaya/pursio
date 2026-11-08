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

### Changed

- Completed skills in the trail and halloween themes use a slightly darker color, so the white text on them is easier to read. (spec: skill-path-ui)
