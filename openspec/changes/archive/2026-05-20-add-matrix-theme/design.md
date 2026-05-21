## Context

The hub theme system already enforces "adding a fourth theme requires only (a) appending a descriptor, (b) a new CSS block, (c) extending an allow-list — no component-code changes." This change is the first real test of that invariant since the system shipped. The Matrix aesthetic adds a constraint the previous three themes didn't have to solve: a near-monochromatic palette where six semantic accent slots (`primary`, `info`, `success`, `secondary`, `warning`, `highlight`) all need to stay visually distinguishable while still reading as "Matrix."

## Goals / Non-Goals

**Goals:**
- Ship `matrix` as a fourth built-in dark theme with phosphor-green identity.
- Hit WCAG AA contrast (≥ 4.5:1) for body copy and ≥ 3:1 for large text / UI components on every surface.
- Keep the six semantic accent slots visually distinct so status filters, sort chips, priority badges, and draft pills don't collapse into "six greens that all look the same."
- Reuse the existing theme switching path: one CSS-var swap, no React remounts, no xterm reinit.
- Validate the "fourth theme = three surgical edits" invariant the theme system was built around.

**Non-Goals:**
- Animated falling-glyph backdrop. Cool, but a perf/readability tax that buys nothing the user can't get from a wallpaper. Deferred.
- Light Matrix variant. Out of character.
- Per-project theming. The existing system is hub-wide-only and this change does not loosen that.
- Dynamic / time-of-day palette shifts.

## Decisions

### Decision: Anchor on `#00FF66`, not `#00FF00`

Pure `#00FF00` is the iconic terminal-green from the film, but on a near-black background it produces visible chromatic-aberration shimmer on most LCDs and reads as harsh after long sessions. `#00FF66` (slightly cyan-shifted green) is what Apple's Terminal "Pro" theme uses and what most modern "Matrix"-style products land on. Indistinguishable from `#00FF00` at a glance, far more comfortable for hours of reading.

**Alternatives considered:**
- `#00FF00` — iconic but harsh. Rejected for ergonomics.
- `#33FF33` — softer but loses the "this is unmistakably green" punch.

### Decision: Foreground is mint (`#B8FFD9`), not green

Body copy in pure phosphor green on a green-tinted dark background fails contrast and creates visual vibration. Mint (`#B8FFD9`) at L ≈ 0.92 against the deep terminal background (`#0A1410`, L ≈ 0.08) hits ~14:1 contrast — comfortably AAA — while still reading as "green-on-black." The phosphor green stays reserved for accents and focus.

### Decision: Warm sentinels for `warning`, `highlight`, `destructive`

A six-green palette is unusable: users cannot distinguish a medium-priority pill from a draft pill from a sort chip. Three warm accents (amber `#FFB347`, gold `#FFD700`, rose `#FF4D6D`) carry the alert-class semantics. Cinematically these are not anti-Matrix: amber recalls the Trinity scene; gold the rabbit-hole; rose the red pill. Functionally they preserve the affordance contract that components already depend on.

**Alternatives considered:**
- Six greens differentiated only by lightness — fails accessibility and produces "six chips that all look the same."
- Replace warmth with cyans / teals only — cleaner thematically, but loses the warning-class distinguishability and the rose/red pill mapping for `destructive`.

### Decision: `accent-info` is teal (`#4FD1C5`), not another green

`accent-info` carries the "neutral but interactive" semantic (links, sort controls, the splitter rule on hover). Using a teal that's adjacent to but distinct from the phosphor green keeps it readable as "actionable but not primary." Stays cool, stays in-palette.

### Decision: Soft glow on `accent-primary` only

A subtle `0 0 8px hsl(var(--accent-primary) / 0.3)` drop-shadow on the primary accent (Add button, focus rings, rail hover) gives the theme its signature cinematic flourish without going overboard. Gated behind `@media (prefers-reduced-motion: no-preference)` so motion-sensitive users opt out automatically. Applied via CSS variable so component code remains theme-agnostic.

**Alternatives considered:**
- Glow on every accent — visually noisy, hurts readability.
- No glow — themes feel interchangeable; the Matrix identity is in the phosphor effect.

### Decision: xterm palette is true-Matrix; Recharts palette spreads across hue

For the terminal panel, the Matrix xterm palette uses a tight green ramp (ANSI 0–7) for "everything is the matrix"; bright variants (8–15) shift to slightly brighter / cyan-tinted greens. For Recharts (analytics), series colors are spread across `accent-primary` → `accent-info` → `accent-warning` → `accent-highlight` → `destructive` → `accent-secondary` so multi-series charts remain readable. Same separation-of-concerns the other themes use.

### Decision: Theme name is `matrix`, label is "Matrix"

Searchability wins. Users will look for "matrix theme," not "phosphor."

## Risks / Trade-offs

- **Trademark adjacency.** "Matrix" is a Warner Bros film property. We're using "matrix-inspired" terminal aesthetics, not their logo/marks. Low risk in an open-source dev tool, but worth noting.
  → Mitigation: label as "Matrix" (descriptive of phosphor terminal aesthetic, not the film); avoid logos or Trinity/Neo references in copy.
- **Monochrome palette pressures the design system.** Some component states (e.g. `accent-secondary` for draft pills) were designed against richer purple/blue palettes and may look samey in Matrix.
  → Mitigation: lightness-spread `accent-secondary` (`#00B864`, deeper green) gives a visible delta from `accent-primary`. Verify draft pills and sort chips by hand under the new theme before shipping.
- **Glow doesn't compose well with anti-aliased focus rings on Windows ClearType.** Drop-shadow filters can produce a faint bloom around already-AA'd glyphs.
  → Mitigation: keep glow at ≤ 8px and α ≤ 0.3; restrict glow to interactive surfaces (buttons, focus rings), not text bodies.
- **LogViewer syntax tokens.** The shared dark syntax palette assumes broad hue range; remapping to "Matrix-flavored" tokens (cyan for keywords, mint for strings, deep green for comments, rose for errors) preserves token differentiation without leaving the palette.
  → Mitigation: write the LogViewer palette out explicitly in the same file as the other themes' palettes; review side-by-side against `obsidian-dark` for parity.

## Migration Plan

No data migration. `matrix` is an additive value in the theme allow-list. Users on `dracula` / `aurora-light` / `obsidian-dark` are unaffected; users who explicitly select `matrix` get the new theme. Rollback = remove the descriptor, CSS block, and allow-list entries; any user persisted on `matrix` falls back to `dracula` via the existing corrupt-localStorage path.

## Open Questions

- Should the Matrix theme set the Appearance picker's order to put it last (newest), or group by dark/light? Current order is dracula → aurora-light → obsidian-dark; appending Matrix at the end is the lowest-friction choice.
- Should we ship a paired font hint (e.g., default to "JetBrains Mono" or "Fira Code" when Matrix is active)? Out of scope here; font is a separate setting.
