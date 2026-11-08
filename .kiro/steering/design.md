---
inclusion: fileMatch
fileMatchPattern: "components/**/*.vue"
---

# Design
- Look: playful, chunky and tactile, like a game but premium. The path is a single vertical, gently winding trail of round skill nodes, split into sections, with occasional side branches.
- Never hardcode colors, fonts or radii. Always use theme tokens (Tailwind classes mapped to CSS variables).
- Raised elements (nodes, primary buttons, banners) have a solid bottom shadow: `0 6px 0 var(--color-*-deep)`. No soft blurry shadows.
- Node shape comes from `--radius-node` (theme-dependent). Never assume circles.
- Fonts: `font-head` for titles, labels and buttons; `font-display` only for big moments (section titles, page title, "+50 XP"); `font-body` for everything else.
- Touch targets at least 44px. Text contrast at least 4.5:1.
- Icons: inline stroke SVGs, 2.2px stroke, round caps. No emoji.
- Avoid: gradient backgrounds on cards, left-border accent cards, default component-library looks, soft drop shadows.
- Every new color need goes into the theme tokens first.