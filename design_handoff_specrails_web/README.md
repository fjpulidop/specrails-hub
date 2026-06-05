# Handoff: specrails.dev redesign

## Overview
This package documents a visual + content redesign of the **specrails** marketing site (`fjpulidop/specrails-web`, served at specrails.dev). It introduces four things:

1. A **light / dark mode toggle** (the site is currently dark-only).
2. An **interactive hero background**: an animated mesh of "rails" where labelled **specs** travel left-to-right and **agents** descend as lightning that scans/illuminates the specs they cross.
3. A new **logo / icon system** (the "SR rails" lockup + a square app icon / favicon).
4. A **content update** to the Agents section clarifying which agents are *core* and how the Developer / Reviewer behave dynamically.

## About the design files
The files in this bundle are **design references created in plain HTML/CSS/JS** — a working prototype showing the intended look and behavior. They are **not** production code to copy in directly.

The target repo (`specrails-web`) is a **Vite + React + TypeScript + Tailwind** app using a **Dracula**-based HSL token theme, with one component per page section under `src/components/`. The task is to **recreate the prototype's look and behavior inside that existing React/Tailwind environment**, using its established patterns (HSL CSS variables in `src/index.css`, `text-dracula-*` utilities, `lucide-react` icons, the section-component structure).

The main reference file is **`SpecRails Redesign.html`** — open it in a browser to see everything live. Line references below point into that file.

## Fidelity
**High-fidelity.** Colors, typography, spacing, the canvas algorithm and the interaction timings are all final in the prototype. Recreate them faithfully, but expressed through the repo's token system rather than the prototype's raw hex/oklch values.

---

## ✅ Decision made: shift the palette to CYAN
The site currently uses the **Dracula palette** (purple `#BD93F9` + pink `#FF79C6` gradients). **This redesign re-tones the site toward the prototype's cyan-forward accent** — `oklch(72% .22 192)` ≈ **`#00C3D2`** on a near-black background (`#06060c`).

This is the larger of the two options and **touches every section**, so treat the palette change as its own first step:

1. **Introduce a primary accent token** for cyan and repoint the brand accent to it. In `src/index.css`, change the brand/accent tokens so the dominant hue is cyan instead of purple/pink:
   - `--primary` → cyan (`191 97% 50%`-ish for dark mode; the existing `--dracula-cyan` is `191 97% 77%`, which is fine for fills/glows but too light for text/buttons on dark — add a deeper `--accent-cyan: 187 100% 41%` ≈ `#00C3D2` for solid accent surfaces and primary text-on-dark).
   - Replace the `--gradient-primary` purple→pink with a cyan-based gradient (e.g. cyan→teal, or cyan→indigo using `--dracula-purple` as the secondary stop for a subtle shift).
   - `--ring`, `--sidebar-primary`, `.gradient-text`, `.gradient-btn`, `.glow-*` defaults: repoint the "hero" glow and primary CTA toward cyan.
2. **Keep the other `--dracula-*` hues** (green, indigo, violet, amber, pink, red, yellow) — they're still used for the multi-color specs/agents in the canvas and for per-agent accents. Only the **dominant brand accent** moves from purple/pink to cyan.
3. **Audit every section component** for hard-wired `text-dracula-purple` / `text-dracula-pink` / purple-pink gradients that were acting as "the brand color" and swap those to the new cyan accent token. Leave intentional per-item hues (e.g. an agent card that is purposely pink) alone.

Everything below uses the **token-based** approach: wherever the prototype hard-codes a color, use the corresponding `hsl(var(--…))` token so the result themes correctly in both light and dark modes. The single "accent" maps to the **new cyan token**.

---

## Change 1 — Light / dark mode

### Goal
A toggle button in the navbar (sun/moon) that flips the whole site between the current dark theme and a new light theme, persisted in `localStorage`, defaulting to dark.

### Prototype reference
- CSS variables + the full light override: `SpecRails Redesign.html` `:root{…}` and `body.light{…}` blocks (top `<style>`, ~lines 30–95).
- Toggle button styles: `.theme-btn` (~line 84).
- Toggle logic incl. persistence: `setTheme()` (~line 703) and the IIFE at the bottom that reads `localStorage.getItem('sr-theme')`.

### Implement in the repo
1. **`src/index.css`** — the theme is already expressed as HSL tokens under `:root`. Wrap the current values in a `.dark`/default scope and add a parallel **light** set of the same token names under a `:root[data-theme="light"]` (or `.light`) selector. Light values from the prototype's `body.light` block, translated to HSL:
   - `--background` ≈ `220 30% 98%` · `--background-darker` ≈ `220 22% 96%`
   - `--foreground` ≈ `240 15% 14%` · `--muted-foreground` ≈ `240 8% 40%`
   - `--border` ≈ `0 0% 0% / 0.10` · card/glass surfaces flip to light-on-dark-text
   - Darken the accent/`--dracula-*` hues ~20% L for contrast on light bg.
   - **Keep the terminal/code blocks dark** in both modes (the prototype forces `.term` dark — match this for `.terminal` and `.docs-prose pre`).
2. **New hook `src/hooks/useTheme.ts`** — `theme` state (`'light' | 'dark'`), default `'dark'`, init from `localStorage('sr-theme')`, effect that sets `document.documentElement.dataset.theme` and persists. (Follow the existing hooks' style in `src/hooks/`.)
3. **`src/components/Navbar.tsx`** — add a `<button>` toggle (lucide `Sun` / `Moon`) in both the desktop (`hidden md:flex`) and mobile (`flex md:hidden`) clusters, calling the hook's toggle. Match the existing icon-button styling (`text-muted-foreground hover:text-foreground`).
4. Add a smooth `transition` on background/color/border (prototype uses ~0.28s; the repo can use a `transition-colors duration-300` utility on `body`).

---

## Change 2 — Interactive hero mesh canvas (the centerpiece)

### What it looks like
A full-bleed `<canvas>` behind the hero content showing:
- A **horizontal mesh** of faint rails (lines) with small node dots, with a subtle 3D perspective + a gentle gravitational "dip" that follows the mouse (nodes near the cursor recede with perspective). Ambient per-node oscillation keeps it alive.
- **Specs**: monospace labels `Spec <1–400>` that travel **left→right** along random rails, each in one of several accent hues, glowing.
- **Agents**: descend **top→bottom** as **lightning bolts that strictly follow grid edges** (right-angle jagged path snapped to columns/rows). Each bolt fades **in slowly, out faster**, illuminating the nodes/edges it passes. A **boxed agent name** (with a light beam racing around its perimeter) travels down the bolt's path — smoothed so it glides rather than zig-zags. Agent names are drawn from a fixed list with **no two active at once**: `Full-Stack Dev, Architect, Reviewer, Security, Backend Dev, Frontend Dev, Merger, Product Mgr, Product Analyst`.
- **Collision**: when an agent overlaps a spec, that spec **lights up at high luminance and gets its own boxed racing-beam outline**, and **stays lit for ~3 s** after the agent leaves.

### Prototype reference
- Entire engine: `SpecRails Redesign.html` from `// ─── HERO MESH CANVAS ───` (~line 826) to the end of that IIFE. **Port this near-verbatim** — it is the hardest part to reconstruct from prose.
- Key constants: `SPACING`, `SPHERE_R`, `SPHERE_D`, `PERSP`, `N_BEAMS`, `N_BOLTS`, `BOLT_SPAWN_RATE`, `PALETTE`, `AGENT_NAMES`.
- Performance work already done (replicate it): positions are projected **once per frame** into a reused `NP[]` array (`computePositions`); all rail lines are drawn in **one batched `stroke()`** and all dots in **one batched `fill()`**; the loop **pauses via `IntersectionObserver`** when the hero scrolls offscreen and on `visibilitychange`.

### Implement in the repo
- Create **`src/components/HeroMesh.tsx`**: a `useRef<HTMLCanvasElement>` + a single `useEffect` that contains the engine and returns a cleanup that cancels the RAF and disconnects the observer. Keep all the mutable engine state in refs/closure (don't put per-frame data in React state).
- Read the accent hues from CSS tokens at runtime (`getComputedStyle(document.documentElement).getPropertyValue('--dracula-purple')` etc.) so the canvas recolors correctly when the theme toggles. The prototype already reads `--ar/--ag/--ab`; swap to the chosen tokens.
- Mount it inside **`src/components/HeroSection.tsx`** as an absolutely-positioned layer behind the existing hero copy (replace/augment the current `.hero-glow` background). Respect `prefers-reduced-motion`: render one static frame instead of animating.
- Honor the existing hero chrome (`hero-glow`, `hero-noise`, `hero-chrome-ring` in `index.css`) — the mesh sits *behind* the hero text, not over the product screenshot.

---

## Change 3 — Logo & icon system

### The mark
Three stacked "rails": two thin rails top & bottom, one **bold center rail** with the word **`specrails`** knocked out (cut out, showing the background through the letters) in `JetBrains Mono`, weight 500, centered, filling the rail width. At small sizes the text drops and it reduces to three clean bars (middle one accent-colored).

### Files in this bundle
- **`specrails-logo.svg`** — horizontal lockup for the navbar (viewBox `0 0 360 96`-ish). The center rail = `currentColor`/foreground, knockout text = background color, thin rails = foreground @ ~16% opacity.
- **`specrails-icon.svg`** — square app icon / favicon (rounded-rect container, same three-rail motif).

### Implement in the repo
- Replace the navbar text wordmark in **`src/components/Navbar.tsx`** (currently `<span class="text-dracula-purple">spec</span><span class="text-dracula-pink">rails</span>`) with an **inline SVG** version of the lockup so it inherits theme colors: center rail `fill="hsl(var(--foreground))"`, knockout text `fill="hsl(var(--background))"`, thin rails `fill="hsl(var(--foreground))"` `opacity="0.16"`. Inline (not `<img>`) so it flips with light/dark automatically. Target height ~40–42px in the 64px navbar; give the word interior breathing room (letter-spacing ~5) and add left margin before the first nav link.
- Swap **`public/favicon.svg`** for `specrails-icon.svg` (the repo's `index.html` references `/favicon.svg`).
- **`src/components/AnimatedLogo.tsx`** currently animates the old wordmark — update it to animate the new mark (e.g. the rails drawing in / the knockout settling), or simplify if no longer needed.

---

## Change 4 — Agents content update

### The rules to convey
- **Three agents are CORE and always run**: **Architect**, **Developer**, **Reviewer**. All others are optional specialists.
- The **Developer is dispatched dynamically**: the `implement` command detects specialized Developer agents by **task keywords** and routes each task to the best-matching Developer.
- The **Reviewer sub-specializes**: it delegates to **Frontend Reviewer** / **Backend Reviewer** when those agents are installed.

### Implement in the repo
1. **`src/data/agents.ts`** — extend `AgentEntry` with `core?: boolean` and `note?: string`. Set `core: true` on `Architect`, `Developer`, `Reviewer`. Add:
   - Developer `note`: *"Dynamically dispatched — `implement` detects specialized Developer agents by keywords and routes each task to the best match."*
   - Reviewer `note`: *"Sub-specializes on demand — delegates to Frontend or Backend Reviewers when those agents are installed."*
2. **`src/components/AgentsSection.tsx`** — render a **"Core"** badge on core agents (filled accent pill, distinct from the existing model badge) and show the accent-colored `note` line at the bottom of the Developer & Reviewer cards. Give core cards a slightly stronger border.
3. **`src/components/AgentComparisonMatrix.tsx`** — add a "Core" column/marker so the matrix reflects the same distinction.
4. **Section intro copy** (the prototype's exact wording): *"Three agents are core and always run — Architect, Developer, and Reviewer. The rest are optional specialists. The `implement` command dispatches the right Developer dynamically by task keywords, and the Reviewer sub-specializes into Frontend or Backend reviewers when installed."*

---

## Design tokens (prototype → repo)
| Prototype | Value | Repo token to use |
|---|---|---|
| `--ac` accent | `oklch(72% .22 192)` ≈ `#00C3D2` | **new `--accent-cyan` / `--primary`** (cyan brand accent) |
| `--bg` | `#06060c` | `--background` / `--dracula-darker` |
| `--tx` text | `#eeeef5` | `--foreground` (`--dracula-fg`) |
| `--mu` muted | `rgba(238,238,245,.46)` | `--muted-foreground` (`--dracula-comment`) |
| `--b` border | `rgba(255,255,255,.08)` | `--border` @ low opacity |
| radius | `10px` | `--radius` (`0.75rem`) |
| Heading font | `Space Grotesk` | site uses **Inter** — keep Inter unless owner wants Space Grotesk |
| Mono font | `JetBrains Mono` | already loaded (`.font-mono`) |

Canvas accent **palette** (specs/agents cycle these): cyan `0,195,210` · green `0,188,105` · indigo `95,138,255` · violet `175,115,245` · amber `220,168,0`. These align closely with the existing `--dracula-cyan/green/purple/pink/yellow` — read those tokens, with **cyan as the lead hue**.

## Assets
- `specrails-logo.svg`, `specrails-icon.svg` — created in this redesign (original work, no third-party assets).
- Fonts: Google Fonts (Inter + JetBrains Mono already imported in `index.css`).
- No raster images introduced; the hero mesh is fully procedural canvas.

## Files in this bundle
- `SpecRails Redesign.html` — the complete working prototype (source of truth for look + behavior + the canvas engine).
- `specrails-logo.svg` — navbar lockup.
- `specrails-icon.svg` — app icon / favicon.
- `README.md` — this document.

## Suggested commit / PR breakdown
1. `feat(theme): cyan accent palette + light mode token set + navbar toggle`
2. `feat(hero): procedural rails mesh canvas (HeroMesh)`
3. `feat(brand): new specrails rails logo + favicon`
4. `feat(agents): mark core agents + dynamic dispatch / sub-specialization notes`

Do the **cyan re-tone as part of PR 1** (or its own PR 0) since it touches every section; keeping the canvas (the largest, riskiest piece) as its own PR makes it reviewable in isolation.
