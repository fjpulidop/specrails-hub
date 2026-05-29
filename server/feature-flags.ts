export function isCodeExplorerEnabled(): boolean {
  return process.env.SPECRAILS_CODE_EXPLORER !== 'false'
}

export function isAskHubEnabled(): boolean {
  const raw = process.env.SPECRAILS_ASK_HUB
  if (raw === undefined) return true
  const v = raw.trim().toLowerCase()
  return !(v === '0' || v === 'false' || v === 'off' || v === 'no')
}
