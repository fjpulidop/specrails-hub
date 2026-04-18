## Why

In the setup wizard configure step, the primary install CTA ("Quick Install" / "Install & Enrich") sits bottom-right of the footer and competes visually with the left-aligned "Skip for now" link. The install action is the wizard's primary forward path and should be visually promoted as such.

## What Changes

- Center the install CTA horizontally in the `AgentSelectionStep` footer.
- Keep "Skip for now" anchored to the left edge of the footer.
- Apply to both tiers (`quick` and `full`) — the button is the same component; only its label changes.

## Capabilities

### New Capabilities
- `setup-wizard-install-cta`: Footer layout rules for the install call-to-action in the setup wizard configure step.

### Modified Capabilities
<!-- None. -->

## Impact

- `client/src/components/SetupWizard.tsx` — footer markup in `AgentSelectionStep` (~lines 232–249).
- `client/src/components/__tests__/SetupWizard.test.tsx` — add coverage that the install CTA is centered.
- No server, API, or DB changes.
