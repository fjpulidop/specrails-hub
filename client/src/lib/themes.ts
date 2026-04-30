/**
 * Theme registry — single source of truth for non-CSS rendering surfaces
 * (xterm terminals, Recharts charts, syntax highlighting, demo tour, and the
 * Settings preview cards).
 *
 * CSS-driven surfaces read tokens from `client/src/globals.css` directly via
 * `[data-theme="..."]` blocks. This module is for surfaces that cannot read
 * CSS variables and need explicit JS-side palettes.
 *
 * To add a new theme: append an entry to `THEMES`, add a matching
 * `[data-theme="<id>"]` block to `globals.css`, and extend `THEME_IDS`.
 * No component code changes required (OCP).
 */

export const THEME_IDS = ['dracula', 'aurora-light', 'obsidian-dark'] as const
export type ThemeId = (typeof THEME_IDS)[number]

/**
 * Type guard usable client + server side. Server validates incoming PATCH
 * payloads against the same allow-list; we keep the source-of-truth list in
 * this client module and import a synchronized server-side copy in
 * `server/hub-router.ts`.
 */
export function isThemeId(v: unknown): v is ThemeId {
  return typeof v === 'string' && (THEME_IDS as readonly string[]).includes(v)
}

export const DEFAULT_THEME: ThemeId = 'dracula'

/**
 * Full xterm.js theme. Mirrors `ITheme` from xterm — duplicated to avoid a
 * direct dependency in this module (themes.ts is consumed by tests and the
 * Settings UI which should not pull xterm in).
 */
export interface XtermTheme {
  background: string
  foreground: string
  cursor: string
  cursorAccent: string
  selectionBackground: string
  black: string
  red: string
  green: string
  yellow: string
  blue: string
  magenta: string
  cyan: string
  white: string
  brightBlack: string
  brightRed: string
  brightGreen: string
  brightYellow: string
  brightBlue: string
  brightMagenta: string
  brightCyan: string
  brightWhite: string
}

/** Status → color map used in Recharts and other dashboards. */
export interface StatusColors {
  completed: string
  failed: string
  canceled: string
  running: string
  queued: string
}

export interface ThemeDescriptor {
  id: ThemeId
  /** User-facing name shown on Settings card. */
  displayName: string
  /** One-line description shown under the name. */
  tagline: string
  /** Whether the theme has a light or dark base. Used for OS color-scheme hint. */
  scheme: 'light' | 'dark'
  /** Swatches displayed on the Settings preview card (background + accents). */
  previewSwatches: {
    background: string
    foreground: string
    accents: [string, string, string, string]
  }
  /** xterm.js terminal palette. */
  xterm: XtermTheme
  /** Recharts series palette (5 colors, no overlap with destructive). */
  chart: [string, string, string, string, string]
  /** Job-status → color map used in dashboards. */
  status: StatusColors
}

// ─── Dracula ────────────────────────────────────────────────────────────────

const DRACULA_PALETTE = {
  bg:      'hsl(231 15% 18%)',
  fg:      'hsl(60 30% 96%)',
  current: 'hsl(232 14% 31%)',
  comment: 'hsl(225 27% 51%)',
  purple:  'hsl(265 89% 78%)',
  cyan:    'hsl(191 97% 77%)',
  green:   'hsl(135 94% 65%)',
  pink:    'hsl(326 100% 74%)',
  orange:  'hsl(31 100% 71%)',
  red:     'hsl(0 100% 67%)',
  yellow:  'hsl(65 92% 76%)',
} as const

const DRACULA: ThemeDescriptor = {
  id: 'dracula',
  displayName: 'Dracula',
  tagline: 'The original — dark purple-tinted with vivid neon accents',
  scheme: 'dark',
  previewSwatches: {
    background: DRACULA_PALETTE.bg,
    foreground: DRACULA_PALETTE.fg,
    accents: [DRACULA_PALETTE.purple, DRACULA_PALETTE.pink, DRACULA_PALETTE.cyan, DRACULA_PALETTE.green],
  },
  xterm: {
    background: DRACULA_PALETTE.bg,
    foreground: DRACULA_PALETTE.fg,
    cursor: DRACULA_PALETTE.purple,
    cursorAccent: DRACULA_PALETTE.bg,
    selectionBackground: 'hsl(232 14% 36%)',
    black: 'hsl(232 14% 24%)',
    red: DRACULA_PALETTE.red,
    green: DRACULA_PALETTE.green,
    yellow: DRACULA_PALETTE.yellow,
    blue: DRACULA_PALETTE.purple,
    magenta: DRACULA_PALETTE.pink,
    cyan: DRACULA_PALETTE.cyan,
    white: DRACULA_PALETTE.fg,
    brightBlack: DRACULA_PALETTE.comment,
    brightRed: 'hsl(0 100% 78%)',
    brightGreen: 'hsl(135 94% 78%)',
    brightYellow: 'hsl(65 92% 86%)',
    brightBlue: 'hsl(265 89% 88%)',
    brightMagenta: 'hsl(326 100% 84%)',
    brightCyan: 'hsl(191 97% 87%)',
    brightWhite: 'hsl(60 30% 100%)',
  },
  chart: [DRACULA_PALETTE.purple, DRACULA_PALETTE.cyan, DRACULA_PALETTE.green, DRACULA_PALETTE.pink, DRACULA_PALETTE.orange],
  status: {
    completed: DRACULA_PALETTE.purple,
    failed:    DRACULA_PALETTE.pink,
    canceled:  DRACULA_PALETTE.orange,
    running:   DRACULA_PALETTE.cyan,
    queued:    DRACULA_PALETTE.comment,
  },
}

// ─── Aurora Light ──────────────────────────────────────────────────────────

const AURORA_PALETTE = {
  bg:        'hsl(220 25% 99%)',
  fg:        'hsl(230 28% 14%)',
  surface:   'hsl(220 22% 96%)',
  muted:     'hsl(225 14% 42%)',
  primary:   'hsl(255 75% 56%)',
  info:      'hsl(195 80% 42%)',
  success:   'hsl(150 65% 36%)',
  secondary: 'hsl(330 75% 52%)',
  warning:   'hsl(35 90% 48%)',
  destructive: 'hsl(0 72% 50%)',
  highlight: 'hsl(45 95% 48%)',
} as const

const AURORA_LIGHT: ThemeDescriptor = {
  id: 'aurora-light',
  displayName: 'Aurora Light',
  tagline: 'Premium light — Linear-inspired indigo on warm off-white',
  scheme: 'light',
  previewSwatches: {
    background: AURORA_PALETTE.bg,
    foreground: AURORA_PALETTE.fg,
    accents: [AURORA_PALETTE.primary, AURORA_PALETTE.secondary, AURORA_PALETTE.info, AURORA_PALETTE.success],
  },
  xterm: {
    background: AURORA_PALETTE.bg,
    foreground: AURORA_PALETTE.fg,
    cursor: AURORA_PALETTE.primary,
    cursorAccent: AURORA_PALETTE.bg,
    selectionBackground: 'hsl(255 75% 90%)',
    black: 'hsl(225 14% 18%)',
    red: AURORA_PALETTE.destructive,
    green: AURORA_PALETTE.success,
    yellow: AURORA_PALETTE.warning,
    blue: AURORA_PALETTE.primary,
    magenta: AURORA_PALETTE.secondary,
    cyan: AURORA_PALETTE.info,
    white: AURORA_PALETTE.fg,
    brightBlack: AURORA_PALETTE.muted,
    brightRed: 'hsl(0 72% 38%)',
    brightGreen: 'hsl(150 65% 26%)',
    brightYellow: 'hsl(35 90% 38%)',
    brightBlue: 'hsl(255 75% 42%)',
    brightMagenta: 'hsl(330 75% 38%)',
    brightCyan: 'hsl(195 80% 32%)',
    brightWhite: 'hsl(230 28% 8%)',
  },
  chart: [AURORA_PALETTE.primary, AURORA_PALETTE.info, AURORA_PALETTE.success, AURORA_PALETTE.secondary, AURORA_PALETTE.warning],
  status: {
    completed: AURORA_PALETTE.primary,
    failed:    AURORA_PALETTE.secondary,
    canceled:  AURORA_PALETTE.warning,
    running:   AURORA_PALETTE.info,
    queued:    AURORA_PALETTE.muted,
  },
}

// ─── Obsidian Dark ─────────────────────────────────────────────────────────

const OBSIDIAN_PALETTE = {
  bg:        'hsl(222 18% 8%)',
  fg:        'hsl(220 18% 92%)',
  surface:   'hsl(222 16% 12%)',
  muted:     'hsl(220 12% 60%)',
  primary:   'hsl(265 80% 72%)',
  info:      'hsl(192 90% 62%)',
  success:   'hsl(150 70% 55%)',
  secondary: 'hsl(330 80% 68%)',
  warning:   'hsl(35 95% 62%)',
  destructive: 'hsl(0 78% 62%)',
  highlight: 'hsl(50 95% 65%)',
} as const

const OBSIDIAN_DARK: ThemeDescriptor = {
  id: 'obsidian-dark',
  displayName: 'Obsidian Dark',
  tagline: 'Premium dark — near-black blue-tinted with electric accents',
  scheme: 'dark',
  previewSwatches: {
    background: OBSIDIAN_PALETTE.bg,
    foreground: OBSIDIAN_PALETTE.fg,
    accents: [OBSIDIAN_PALETTE.primary, OBSIDIAN_PALETTE.info, OBSIDIAN_PALETTE.secondary, OBSIDIAN_PALETTE.success],
  },
  xterm: {
    background: OBSIDIAN_PALETTE.bg,
    foreground: OBSIDIAN_PALETTE.fg,
    cursor: OBSIDIAN_PALETTE.primary,
    cursorAccent: OBSIDIAN_PALETTE.bg,
    selectionBackground: 'hsl(222 16% 22%)',
    black: 'hsl(222 16% 14%)',
    red: OBSIDIAN_PALETTE.destructive,
    green: OBSIDIAN_PALETTE.success,
    yellow: OBSIDIAN_PALETTE.warning,
    blue: OBSIDIAN_PALETTE.primary,
    magenta: OBSIDIAN_PALETTE.secondary,
    cyan: OBSIDIAN_PALETTE.info,
    white: OBSIDIAN_PALETTE.fg,
    brightBlack: OBSIDIAN_PALETTE.muted,
    brightRed: 'hsl(0 78% 78%)',
    brightGreen: 'hsl(150 70% 70%)',
    brightYellow: 'hsl(35 95% 78%)',
    brightBlue: 'hsl(265 80% 86%)',
    brightMagenta: 'hsl(330 80% 80%)',
    brightCyan: 'hsl(192 90% 78%)',
    brightWhite: 'hsl(220 18% 100%)',
  },
  chart: [OBSIDIAN_PALETTE.primary, OBSIDIAN_PALETTE.info, OBSIDIAN_PALETTE.success, OBSIDIAN_PALETTE.secondary, OBSIDIAN_PALETTE.warning],
  status: {
    completed: OBSIDIAN_PALETTE.primary,
    failed:    OBSIDIAN_PALETTE.secondary,
    canceled:  OBSIDIAN_PALETTE.warning,
    running:   OBSIDIAN_PALETTE.info,
    queued:    OBSIDIAN_PALETTE.muted,
  },
}

// ─── Public registry ───────────────────────────────────────────────────────

export const THEMES: Record<ThemeId, ThemeDescriptor> = {
  'dracula':       DRACULA,
  'aurora-light':  AURORA_LIGHT,
  'obsidian-dark': OBSIDIAN_DARK,
}

export function getTheme(id: ThemeId): ThemeDescriptor {
  return THEMES[id]
}

/** localStorage key used by the anti-FOUC boot script and ThemeContext mirror. */
export const THEME_LOCAL_STORAGE_KEY = 'specrails-hub:ui-theme'
