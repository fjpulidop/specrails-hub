export function isCodeExplorerEnabled(): boolean {
  return process.env.SPECRAILS_CODE_EXPLORER !== 'false'
}

/**
 * Browser-capture feature ("Add Spec from browser"): an embedded CDP/Chromium
 * browser whose screencast is streamed in-app, plus region-select → screenshot +
 * DOM capture that feeds Add Spec (Quick/Explore). Server-side default ON; set
 * SPECRAILS_BROWSER_CAPTURE="false" to disable the routes + WS endpoint entirely
 * (emergency rollback). The client gates separately on VITE_FEATURE_BROWSER_CAPTURE.
 */
export function isBrowserCaptureEnabled(): boolean {
  return process.env.SPECRAILS_BROWSER_CAPTURE !== 'false'
}

/**
 * Jira integration ("spec = Jira issue", per-project hot-swap local↔Jira).
 * Server-side default ON; set SPECRAILS_JIRA_SECTION="false" to 404 the routes
 * and skip all sync (emergency rollback). The feature is inert until a project
 * actually configures a Jira connection, so default-on is safe. The client gates
 * separately on VITE_FEATURE_JIRA.
 */
export function isJiraEnabled(): boolean {
  return process.env.SPECRAILS_JIRA_SECTION !== 'false'
}
