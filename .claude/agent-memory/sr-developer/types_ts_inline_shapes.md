---
name: types.ts inline WS payload shapes
description: server/types.ts defines SetupInstallDoneMessage and SetupCompleteMessage with inline summary shapes — must update these when SetupSummary changes
type: project
---

`server/types.ts` contains `SetupInstallDoneMessage` and `SetupCompleteMessage` with a `summary` field typed as an inline object literal. When `SetupSummary` in `setup-manager.ts` changes shape, TypeScript won't catch the mismatch until you try to assign a real `SetupSummary` to these types.

**Why:** The two types evolved independently and the inline shapes were never factored into a shared type.

**How to apply:** When modifying `SetupSummary`, immediately check `server/types.ts` for the matching `SetupInstallDoneMessage.summary` and `SetupCompleteMessage.summary` fields and update them. The canonical fix is to extract a `SetupSummaryPayload` interface in `types.ts` and reference it from both message types — as was done in the truthful-setup-summary change (2026-04-18).
