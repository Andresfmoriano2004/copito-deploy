---
name: "copito-deploy Design System"
description: "Framework-agnostic design rules for web and mobile app implementation."

# ─── Colors ───────────────────────────────────────────────
colors:
  # Brand
  primary:       "#ff8b8b"
  primaryStrong: "#7a3f3f"
  primarySoft:   "#ffcbcb"
  accent:        "#ff8b8b"

  # Surfaces
  surface:       "#fff8ea"
  surfaceMuted:  "#fff3e8"

  # Text & Border
  text:          "#7a3f3f"
  border:        "#d66f6f"

  # Feedback
  success:       "#16A34A"
  warning:       "#D97706"
  danger:        "#DC2626"

# ─── Typography ───────────────────────────────────────────
typography:
  family:        "system-ui, -apple-system, Segoe UI, sans-serif"
  displayFamily: "system-ui, -apple-system, Segoe UI, sans-serif"
  monoFamily:    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
  source:        "system font stack"
  weights:       "300, 400, 500, 600"
  defaultWeight: 600
  tone:          "sans"

# Spacing
spacing:
  xs:      4px
  sm:      8px
  md:      12px
  lg:      16px
  xl:      24px
  xxl:     32px
  section: 48px

# Radius
radius:
  sm: 4px
  md: 8px
  lg: 12px

# Motion
motion:
  fast:   120ms
  normal: 180ms
  slow:   260ms
---

# Design System Rules

## Purpose
copito-deploy Design System defines portable, framework-agnostic design rules for web and mobile product interfaces. Use it as the source of truth before changing layouts, components, color, typography, motion, or interaction states.

This file is a portable design skill. Any AI or engineer should be able to read it and improve a web or mobile interface without needing React, Vue, Svelte, Tailwind, native mobile, or any other specific technology.

## Operating Modes

### New Project Mode
- Use these rules to create a coherent first implementation when no existing UI exists.
- Build the information architecture, component system, and responsive behavior from the tokens and rules below.

### Existing Project Refactor Mode
- Treat the existing product as the source of truth for content, routes, behavior, data, and information architecture.
- Improve the visual system by patching styles, tokens, spacing, typography, hierarchy, responsive behavior, and component states.
- Do not regenerate whole pages from scratch when a targeted patch can preserve the current experience.
- Do not replace real content with placeholder, demo, lorem ipsum, or simplified content.
- If a section looks inconsistent with this design system, restyle it first. Do not remove it.
- If removing content, routes, features, media, or data logic seems necessary, stop and ask for approval.

## Preservation Rules For Existing Products
- Preserve all existing headings, paragraphs, labels, buttons, links, images, icons, forms, navigation items, sections, routes, and data-fetching logic unless the user explicitly requests removal.
- Preserve semantic meaning and section order unless the user asks for an information-architecture change.
- Preserve working interactions: forms, menus, language toggles, theme toggles, dialogs, tabs, carousels, and scroll behavior.
- Preserve real brand/product names and domain-specific copy. Design changes must not make the page generic.
- Keep every original section represented after the refactor. A redesigned section is acceptable; a missing section is not.
- Never leave the first viewport empty unless the existing product intentionally has an empty state.

## Safe Refactor Workflow
1. Read the existing UI code before editing. Identify sections, routes, state, data dependencies, and user actions.
2. Inventory current colors, typography, spacing, radius, shadows, and component states.
3. Map old visual values to the tokens in this file one-to-one where possible.
4. Patch section by section. Avoid full-file rewrites when the current structure works.
5. After each section, verify the original content is still present, visible, and reachable.
6. After changing colors, check every affected text/background pair for contrast.
7. Verify desktop and mobile before finishing.

## Visual Direction
- Color direction: Coral Cream - Soft friendly warmth.
- Typography direction: System Sans - Clean product UI.
- Style direction: Minimalistic - White-space led product pages with bold type, pill navigation, and quiet social proof
- References: Mobbin landing pages, Minimal app directory heroes, Floating logo proof sections, Editorial SaaS pages.
- Visual style: Coral Cream color direction, System Sans typography, Minimalistic style.

## Style System: Minimalistic
Use Minimalistic to create quiet, premium product pages that feel spacious, intentional, and editorial. The signature is a white or off-white stage, a compact centered pill navigation, oversized black typography, short supporting copy, simple rounded CTAs, pale gray proof logos, and occasional floating app icons around a central metric or message. It works best for SaaS, product directories, design tools, portfolios, documentation, and premium web apps where trust and clarity matter more than decoration.

### Layout Rules
- lead with a centered first viewport: small product mark or app icon, one large headline, one short support line, and one or two compact CTAs.
- use a compact pill navigation near the top center; keep it horizontally balanced, softly tinted, and visually lighter than the hero headline.
- let whitespace be the main layout material; large blank areas are acceptable only when they frame a clear message, proof point, or product preview.
- place trust logos in a quiet gray row after the hero; make them secondary, evenly spaced, and clearly lower priority than the CTA.
- use large pale rounded preview blocks below the fold to hint at product content without adding visual noise.
- for proof sections, arrange floating app icons or brand marks around one central statistic or sentence with generous distance between items.
- keep content containers narrow for reading: 720px to 900px for hero copy, 1120px to 1280px for preview or logo fields.
- mobile layout should collapse to a single centered column, with floating logos reduced, hidden, or converted into a simple grid.

### Component Patterns
- headlines should be large, black, and confident with tight line-height; use weight and scale instead of decoration.
- body text should be muted gray, short, and centered in marketing surfaces; avoid long paragraphs in the hero.
- primary CTAs should be black filled pills with white text; secondary CTAs should be white or transparent pills with a thin gray border.
- nav items should sit inside a single rounded pill container; active or primary nav actions can use a black pill inside it.
- app icons and brand marks should use rounded-square tiles with simple shadows or hairline borders, never heavy cards.
- logo rows should be grayscale or low-contrast to avoid competing with the headline.
- large preview containers should be pale gray, rounded, and mostly quiet; avoid filling them with fake dense content.
- forms, tables, and dashboards should keep the same restraint: visible labels, clear rows, and minimal dividers.

### Existing Project Refactor Rules
- inventory the existing interface first: navigation, hero, content sections, CTAs, forms, data, and footer.
- preserve every section, but reduce competing wrappers, borders, shadows, and secondary text until hierarchy becomes obvious.
- do not delete real copy, images, logos, or features to create empty space; reorganize and prioritize instead.
- patch spacing, typography, and color section by section instead of rebuilding the whole page.
- if the product already has brand logos, customer logos, app icons, or metrics, convert them into quiet proof moments instead of decorative badges.
- if a section is already minimal and readable, preserve it and only align spacing, radius, and typography.
- when simplifying clutter, keep completion paths visible: signup, pricing, login, search, filters, forms, and navigation must remain reachable.
- if a page is data-heavy, use Minimalistic for shell, spacing, typography, and hierarchy; do not hide required density.
- preserve semantic structure: headings, landmarks, lists, and form labels must remain correct.

### Spacing Rules
- use a consistent spacing scale: 4px, 8px, 12px, 16px, 24px, 32px, 48px, 64px, 96px.
- hero spacing should be generous: 96px to 160px vertical breathing room on desktop when content is sparse enough.
- section padding should usually be 72px to 120px on desktop, 48px to 72px on mobile.
- pill navigation should be compact: 8px to 12px internal padding, balanced gaps, and no oversized height.
- icon constellations need large gaps; do not let floating logos cluster near the central message.
- card padding should be 24px to 32px for standard cards, 16px to 20px for compact proof or logo tiles.
- form field spacing should be 16px to 24px between fields, 8px between label and input.
- keep container max width around 1120px to 1280px for main content, 720px to 900px for centered hero copy.
- use consistent gutters of 16px to 24px in grid layouts.
- prefer blank space over divider lines, except for subtle borders around buttons, nav pills, and preview surfaces.

### Visual Hierarchy Rules
- typography is the primary hierarchy tool: one dominant headline, one muted support line, and small confident labels.
- use black, white, and gray as the main palette; accent color should be limited to product marks, app icons, or one key visual signal.
- the primary CTA should be the strongest interactive object; everything else should feel quieter.
- floating icons should support the story and proof, not become a decorative wallpaper.
- avoid gradients, glows, glass effects, neumorphic relief, dense card grids, and heavy shadows.
- keep borders thin, pale, and functional; use them mainly to define pills, icon tiles, and preview shells.
- large numbers or proof statements can become hero-scale elements when the section is about credibility.

### Style Anti-patterns
- turn Minimalistic into a generic blank page with no proof, product signal, or clear action.
- add decorative gradients, blurred blobs, glass panels, neumorphic surfaces, or busy background patterns.
- use many competing accent colors outside app icons, brand marks, or real product assets.
- nest content in excessive cards, bordered panels, or dense feature grids.
- let floating logos overlap text, CTAs, navigation, or each other.
- use low-contrast gray for important copy, labels, or controls.
- make every element bold; restraint only works when hierarchy has clear contrast.

### Style Checklist
- the first viewport has a clear centered message, strong typography, and compact actions.
- navigation reads as a refined pill, not a generic full-width header.
- trust logos, app icons, or metrics are present when the page needs credibility.
- floating elements have enough space and never compete with the main text.
- preview blocks are pale, rounded, and quiet rather than card-heavy.
- black, white, and gray carry most of the interface, with accent used intentionally.
- the result feels premium, sparse, useful, and deliberate rather than unfinished.

## Design Tokens
Use semantic tokens first. Raw values from frontmatter are source values, not permission to scatter hex codes or one-off sizes through implementation.

### Color
- Primary action color: #ff8b8b.
- Strong primary: #7a3f3f. Use for high-emphasis text, selected state, or strong borders.
- Soft primary: #ffcbcb. Use for subtle surfaces, selected backgrounds, or calm highlights.
- Surface: #fff8ea.
- Muted surface: #fff3e8.
- Text: #7a3f3f.
- Border: #d66f6f.
- Success, warning, and danger are semantic states. Pair them with labels, icons, or position; never rely on color alone.
- When moving from a dark theme to a light or warm theme, update inherited light text classes such as white, muted-white, or low-opacity foregrounds.
- Do not apply one warm/cream/brown palette across the entire page without contrast, hierarchy, and content anchors.

### Text Selection
- Use this style-specific `::selection` treatment for Minimalistic. It should follow the selected color tokens and stay readable.
```css
/* Minimalistic selection: quiet editorial inversion. */
::selection {
  background-color: #7a3f3f;
  color: #fff8ea;
  text-shadow: none;
}
```
- If the selected color changes, keep the same style behavior but re-check text/background contrast.

### Contrast And Visibility Gate
- Every visible text node must remain readable after color changes.
- Check hero text, navigation, buttons, card titles, form labels, helper text, icons, borders, and disabled states against their actual backgrounds.
- If legacy classes or CSS keep text white on a light surface, replace them with semantic foreground tokens.
- If content appears missing after a restyle, inspect contrast and visibility before deleting or rebuilding the section.
- Do not finish with invisible text, hidden CTAs, empty hero areas, or decorative backgrounds replacing product content.

### Typography
- Primary family: system-ui, -apple-system, Segoe UI, sans-serif.
- Display family: system-ui, -apple-system, Segoe UI, sans-serif.
- Monospace family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace.
- Allowed weights: 300, 400, 500, 600.
- Default UI weight: 600.
- Keep heading levels semantic. Visual size must follow layout importance, not HTML heading number.
- Keep letter spacing at 0 by default. Use uppercase labels sparingly and only for short metadata.

### Spacing And Radius
- Spacing scale: 4/8/12/16/24/32/48.
- Prefer spacing and grouping over extra borders.
- Use 4px radius for compact controls, 8px for standard cards/inputs, and 12px only for larger feature surfaces.
- Do not invent new spacing values unless the layout cannot be solved with the scale.

## Layout Rules
- Start mobile-first. The smallest useful viewport defines the base layout.
- Use content-driven breakpoints. Do not scale type directly with viewport width.
- Keep navigation, primary actions, and form completion paths easy to reach on touch devices.
- Prefer a clear grid, predictable alignment, and stable dimensions for controls, cards, tabs, and repeated items.
- Empty, loading, and error states must preserve layout stability and explain the next action.

## Component Rules
- Every interactive component must define default, hover, active, focus-visible, disabled, loading, success, and error behavior when those states apply.
- Buttons must communicate hierarchy through role: primary, secondary, tertiary, destructive, or icon-only.
- Forms must keep labels visible, helper text close to the field, and errors specific enough to fix.
- Cards must represent repeated items or contained tools. Do not nest cards inside other cards.
- Modals and popovers must include focus management, escape behavior, and clear dismissal affordances.

## Interaction And Motion
- Motion must clarify state change, not decorate the screen.
- Transitions should usually stay between 120ms and 260ms.
- Provide reduced-motion behavior for animations, parallax, shimmer, and auto-moving content.
- Pointer hover cannot be the only way to reveal important controls because touch devices do not have hover.

## Accessibility Requirements
WCAG 2.2 AA, keyboard-first interactions, visible focus states, semantic HTML before ARIA, reduced-motion support, accessible target sizes.

- Text and meaningful non-text UI must meet WCAG 2.2 AA contrast.
- Keyboard users must be able to reach, understand, and operate every interactive control.
- Focus indicators must be visible, high-contrast, and not hidden by overflow or animation.
- Semantic HTML or native platform semantics come before ARIA patches.
- Touch targets should be at least 24px by WCAG 2.2 AA and should reach 44px when layout allows.

## Content Tone
Clear, concise, implementation-focused, low-jargon, and helpful without being decorative.

- Use direct labels for actions.
- Avoid vague UI copy like "Submit" when the action can be named.
- Keep empty states useful: state what happened, why it matters, and what the user can do next.

## Rules: Do
- use semantic tokens before raw values in components.
- preserve existing content, copy, media, routes, and behavior when applying this system to an existing project.
- preserve hierarchy with spacing, contrast, typography, and component state.
- define default, hover, active, focus-visible, disabled, loading, success, and error states.
- design mobile-first, then enhance for tablet and desktop density.
- keep implementation guidance portable across React, Vue, Svelte, plain HTML/CSS, and mobile UI stacks.
- use white or off-white surfaces with black type and subtle gray supporting text.
- create a focused hero with a product mark, large headline, short subcopy, and compact CTAs.
- use pill navigation and pill CTAs when the product surface is marketing-oriented.
- use quiet proof: grayscale logos, small trust labels, large central metrics, or floating brand icons.
- keep visual assets sparse, real, and recognizable; one icon can carry more weight than several illustrations.
- preserve clarity on mobile by simplifying floating elements into a small grid or hiding nonessential marks.

## Rules: Don't
- use low-contrast text, hidden focus indicators, or color-only state communication.
- delete or replace existing product content unless the user explicitly asks for content removal.
- introduce one-off spacing, typography, or radius values outside the token system.
- mix unrelated visual metaphors in the same screen.
- depend on framework-specific component names in design rules.
- add decorative motion without reduced-motion fallbacks.
- turn Minimalistic into a generic blank page with no proof, product signal, or clear action.
- add decorative gradients, blurred blobs, glass panels, neumorphic surfaces, or busy background patterns.
- use many competing accent colors outside app icons, brand marks, or real product assets.
- nest content in excessive cards, bordered panels, or dense feature grids.
- let floating logos overlap text, CTAs, navigation, or each other.
- use low-contrast gray for important copy, labels, or controls.
- make every element bold; restraint only works when hierarchy has clear contrast.

## AI Implementation Checklist
- Read this file before changing UI, layout, component styling, or interaction behavior.
- Identify the target surface: mobile app, mobile web, desktop web, dashboard, landing page, form flow, or content-heavy view.
- Map the design tokens to the project technology without changing the design intent.
- Reuse existing project components when they can satisfy these rules.
- If the current UI conflicts with this file, explain the conflict and choose the more accessible, consistent option.
- Confirm all original navigation items, hero content, CTAs, media, sections, and forms still exist unless removal was requested.
- Confirm no text became invisible from background, opacity, blend-mode, or inherited color changes.
- Confirm the first viewport contains meaningful product content, not just a background treatment.
- Verify keyboard navigation, focus-visible styling, responsive behavior, text overflow, loading state, and error state before finishing.
