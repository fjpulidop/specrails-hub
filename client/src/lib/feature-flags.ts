export const FEATURE_CHAT_ENABLED = false

export const FEATURE_TERMINAL_PANEL = (() => {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
  const override = env?.VITE_FEATURE_TERMINAL_PANEL
  // Default ON. Opt-out by setting VITE_FEATURE_TERMINAL_PANEL=false.
  if (typeof override === 'string') return override !== 'false'
  return true
})()

/** Gates the Agents section (sidebar entry + /agents route). Default ON. */
export const FEATURE_AGENTS_SECTION = (() => {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
  const override = env?.VITE_FEATURE_AGENTS_SECTION
  if (typeof override === 'string') return override !== 'false'
  return true
})()
