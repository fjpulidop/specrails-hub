## 1. Footer layout

- [x] 1.1 In `client/src/components/SetupWizard.tsx` `AgentSelectionStep`, rewrite the footer container (~line 233) to a `relative flex items-center` wrapper.
- [x] 1.2 Absolutely-position "Skip for now" at the left edge of the footer (`absolute left-6`), and center the install `<Button>` via `mx-auto`. Wrap the button in a centered container with `data-testid="install-cta-wrapper"` to support test assertions.
- [x] 1.3 Preserve existing footer border, padding, and vertical sizing so no layout shift occurs relative to sibling steps.

## 2. Tests

- [x] 2.1 In `client/src/components/__tests__/SetupWizard.test.tsx`, add a test: "centers the install CTA (quick tier)" — renders the wizard with default config, asserts the "Quick Install" button is inside an element with `data-testid="install-cta-wrapper"` and that wrapper has `mx-auto` class.
- [x] 2.2 Add a test: "centers the install CTA (full tier)" — renders the wizard, switches to Full Setup, asserts the "Install & Enrich" button is inside the centered wrapper.
- [x] 2.3 Add a test: "Skip for now remains left-anchored" — renders the wizard and asserts the Skip control has an absolute-positioning class (e.g., `absolute`) and sits to the left of the install button in DOM order.

## 3. Verification

- [x] 3.1 Run `cd client && npx tsc --noEmit` to confirm no type regressions. (Output: "TypeScript compilation completed".)
- [x] 3.2 Run `npm test` to confirm all existing `SetupWizard` tests still pass alongside the new assertions. (32 files / 1119 tests passed.)
- [ ] 3.3 Manually verify in the running dev server (`npm run dev`) that the install CTA is optically centered and the Skip control is on the left without overlap. *(Deferred: cannot launch a dev server from this automated session — user should verify before archive.)*
