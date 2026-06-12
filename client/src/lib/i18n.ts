/**
 * i18n registry — single source of truth for the hub-wide UI language.
 *
 * Architecture mirrors the theme system (`lib/themes.ts` + ThemeContext):
 *  - `LANGUAGE_IDS` is the allow-list, duplicated server-side in
 *    `server/hub-router.ts` (LANGUAGE_ID_ALLOWLIST) to avoid pulling client
 *    code into the server bundle.
 *  - Persisted hub-wide as `hub_settings.ui_language`, mirrored to
 *    `localStorage['specrails-hub:ui-language']` so boot picks the right
 *    language before the server round-trip.
 *
 * Resource loading:
 *  - English is bundled EAGERLY (always-available fallback → no flash of raw
 *    keys, synchronous init in jsdom tests).
 *  - Other languages load lazily via dynamic import on first switch, then
 *    `i18n.changeLanguage` re-renders every `useTranslation` consumer —
 *    hot switch, no app restart.
 *
 * To add a new language:
 *  1. Add the id to `LANGUAGE_IDS` and a descriptor to `LANGUAGES`.
 *  2. Create `client/src/locales/<id>/` with the same JSON namespaces as
 *     `locales/en/` (key parity enforced by `lib/__tests__` parity test).
 *  3. Extend `LANGUAGE_ID_ALLOWLIST` in `server/hub-router.ts`.
 *  4. Map a date-fns locale in `DATE_FNS_LOCALES` below.
 * No component code changes required (OCP).
 */
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import type { Locale } from 'date-fns'
import { enUS, es, fr, de, pt, it, zhCN, ja } from 'date-fns/locale'

export const LANGUAGE_IDS = ['en', 'es', 'fr', 'de', 'pt', 'it', 'zh', 'ja'] as const
export type LanguageId = (typeof LANGUAGE_IDS)[number]

export interface LanguageDescriptor {
  id: LanguageId
  /** Name shown in the Settings selector, in the language itself. */
  nativeName: string
  /** English name (tooltip / accessibility). */
  englishName: string
}

export const LANGUAGES: Record<LanguageId, LanguageDescriptor> = {
  en: { id: 'en', nativeName: 'English', englishName: 'English' },
  es: { id: 'es', nativeName: 'Español', englishName: 'Spanish' },
  fr: { id: 'fr', nativeName: 'Français', englishName: 'French' },
  de: { id: 'de', nativeName: 'Deutsch', englishName: 'German' },
  pt: { id: 'pt', nativeName: 'Português', englishName: 'Portuguese' },
  it: { id: 'it', nativeName: 'Italiano', englishName: 'Italian' },
  zh: { id: 'zh', nativeName: '中文', englishName: 'Chinese' },
  ja: { id: 'ja', nativeName: '日本語', englishName: 'Japanese' },
}

export const DEFAULT_LANGUAGE: LanguageId = 'en'

/** localStorage key mirroring the server-persisted `hub_settings.ui_language`. */
export const LANGUAGE_LOCAL_STORAGE_KEY = 'specrails-hub:ui-language'

/** Type guard usable client + server side (server keeps a synchronized copy). */
export function isLanguageId(v: unknown): v is LanguageId {
  return typeof v === 'string' && (LANGUAGE_IDS as readonly string[]).includes(v)
}

// ─── Resources ──────────────────────────────────────────────────────────────

function nsFromPath(path: string): string {
  return path.split('/').pop()!.replace(/\.json$/, '')
}

// English: eager — part of the main bundle, guarantees fallback rendering.
const enModules = import.meta.glob('../locales/en/*.json', { eager: true }) as Record<
  string,
  { default: Record<string, unknown> }
>

// All languages: lazy loaders (English entries unused — already eager).
const lazyModules = import.meta.glob('../locales/*/*.json') as Record<
  string,
  () => Promise<{ default: Record<string, unknown> }>
>

const enResources: Record<string, Record<string, unknown>> = {}
for (const [path, mod] of Object.entries(enModules)) {
  enResources[nsFromPath(path)] = mod.default
}

/** Namespace list derived from the files under `locales/en/`. */
export const NAMESPACES = Object.keys(enResources)

const loadedLanguages = new Set<LanguageId>([DEFAULT_LANGUAGE])

/**
 * OS/browser language detection — used on first run only (no stored choice).
 * Matches the base subtag (`es-ES` → `es`, `zh-Hans-CN` → `zh`) against the
 * supported list; falls back to English.
 */
export function detectSystemLanguage(): LanguageId {
  if (typeof navigator !== 'undefined') {
    const candidates: readonly string[] =
      navigator.languages && navigator.languages.length > 0
        ? navigator.languages
        : [navigator.language]
    for (const tag of candidates) {
      if (!tag) continue
      const base = tag.toLowerCase().split('-')[0]
      if (isLanguageId(base)) return base
    }
  }
  return DEFAULT_LANGUAGE
}

/**
 * Boot order: explicit stored choice (localStorage mirror of the server
 * setting) → OS/browser language → English. The OS detection is NOT written
 * back to storage: until the user picks a language explicitly, the app keeps
 * following the system language.
 */
export function readBootLanguage(): LanguageId {
  if (typeof localStorage !== 'undefined') {
    try {
      const v = localStorage.getItem(LANGUAGE_LOCAL_STORAGE_KEY)
      if (isLanguageId(v)) return v
    } catch {
      /* ignore */
    }
  }
  return detectSystemLanguage()
}

// Synchronous init (in-memory resources, no backend plugin) — jsdom tests can
// render `useTranslation` consumers immediately, no provider wrapping needed
// (initReactI18next registers this instance as the react-i18next default).
void i18n.use(initReactI18next).init({
  lng: DEFAULT_LANGUAGE,
  fallbackLng: DEFAULT_LANGUAGE,
  defaultNS: 'common',
  ns: NAMESPACES,
  resources: { [DEFAULT_LANGUAGE]: enResources },
  interpolation: { escapeValue: false }, // React already escapes
  returnNull: false,
})

/** Fetch a language's namespaces into memory (no-op when already loaded). */
export async function loadLanguage(lng: LanguageId): Promise<void> {
  if (loadedLanguages.has(lng)) return
  const entries = Object.entries(lazyModules).filter(([p]) => p.includes(`/locales/${lng}/`))
  const bundles = await Promise.all(
    entries.map(async ([p, loader]) => [nsFromPath(p), (await loader()).default] as const)
  )
  for (const [ns, data] of bundles) {
    i18n.addResourceBundle(lng, ns, data, true, true)
  }
  loadedLanguages.add(lng)
}

/**
 * Hot-switch the active language: load resources if needed, re-render all
 * `useTranslation` consumers, update `<html lang>`. Never requires a restart.
 */
export async function setLanguage(lng: LanguageId): Promise<void> {
  await loadLanguage(lng)
  await i18n.changeLanguage(lng)
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lng
  }
}

/**
 * Boot hook (called from `main.tsx` before first render): apply the persisted
 * language so the first paint is already translated. Falls back to English on
 * any load failure.
 */
export async function initI18n(): Promise<void> {
  const boot = readBootLanguage()
  if (boot !== DEFAULT_LANGUAGE) {
    try {
      await setLanguage(boot)
    } catch {
      /* keep English */
    }
  }
}

export function getActiveLanguage(): LanguageId {
  return isLanguageId(i18n.language) ? i18n.language : DEFAULT_LANGUAGE
}

// ─── date-fns locale bridge ─────────────────────────────────────────────────
// Components calling `formatDistanceToNow` / `format` pass
// `{ locale: getDateFnsLocale() }` so relative dates follow the UI language.

const DATE_FNS_LOCALES: Record<LanguageId, Locale> = {
  en: enUS,
  es,
  fr,
  de,
  pt,
  it,
  zh: zhCN,
  ja,
}

export function getDateFnsLocale(lng?: string): Locale {
  const id = lng ?? i18n.language
  return DATE_FNS_LOCALES[isLanguageId(id) ? id : DEFAULT_LANGUAGE]
}

export default i18n
