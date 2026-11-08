# Pursio

Pursio turns any hobby into a gamified learning path. The user types a hobby (e.g. "bouldering", "film photography") and AI builds a skill tree for it. The user works through it node by node: each skill has a short description, 3 small quests and fresh content (videos and articles) from across the web. Completing skills gives XP, levels and streaks, and unlocks the next skills.

Promise: "ChatGPT tells you the path; Pursio walks it with you."

## Who it's for
Beginner and intermediate hobbyists who want to get better or feel stuck, and self-learners who learn from YouTube but feel their learning is unstructured. Not experts, not casual fans.

## Core experience
- Duolingo-style vertical winding path, split into sections (Beginner, Intermediate, Advanced). Optional side quests branch off the main path. Each section ends with a milestone.
- Node states: locked, current (with a quest progress ring), completed, side quest, milestone.
- Tapping a node opens a bottom sheet (mobile) or side panel (desktop) with description, quests, fresh content and "Mark complete".
- Completing a skill plays an unlock moment (+XP, next skill unlocked).

## Mascot: Wick
A small lantern spirit that lights the next step on your path. One base character with three slots (head, hand, side). The AI picks an accessory set from a fixed library based on the hobby (bouldering, photography, cooking, guitar, gardening, reading, explorer as fallback). Moods: idle, cheering, thinking (loading), sleepy (streak lost).

## Themes
All visuals come from design tokens (colors, fonts, node shape, path style), so themes are swappable: "boulder" (default), "trail" and "halloween". The theme sets the colors; the hobby sets Wick's outfit.

## MVP scope (hackathon, Nov 8 – Dec 4, 2026)
In: AI skill tree generation, path view, node detail with quests, progress (XP, levels, streak), fresh content per node (RSS + YouTube, AI-tagged and summarized), Wick with hobby outfits, landing page with live "type a hobby, get a tree" demo + waitlist.
Out (later): social feed, matching with other users, leaderboards, payments, native app, photo/video progress logs.
Rule: if it doesn't improve the first 30 seconds of the demo, it waits.

## Tech
Nuxt 4 + Vue 3 + TypeScript (strict). Supabase for Auth, Postgres (RLS), Edge Functions, pg_cron and pgvector. Skill tree layout with elkjs, rendered as SVG. Web first, mobile-first layout.

## Context
Built for the Kiroween 2026 hackathon (Frankenstein category). Public repo under AGPL-3.0. The Pursio name, logo and Wick mascot are not covered by the license.