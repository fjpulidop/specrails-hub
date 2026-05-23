export function isCodeExplorerEnabled(): boolean {
  return process.env.SPECRAILS_CODE_EXPLORER !== 'false'
}
