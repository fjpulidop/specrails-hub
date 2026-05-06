## MODIFIED Requirements

### Requirement: Quick mode preserves existing fast-path behaviour
The `Quick` mode SHALL behave identically to the current default `Generate Spec` flow: the user's idea, any attachments, and the model selected in the Add Spec model picker are sent to `POST /api/projects/:projectId/tickets/generate-spec`, the modal closes, and a toast tracks generation progress until the new ticket appears.

#### Scenario: Quick submits to generate-spec
- **WHEN** the user types an idea in Quick mode and clicks `Generate Spec`
- **THEN** the modal closes
- **AND** a `POST /api/projects/<id>/tickets/generate-spec` is sent with `{ idea, attachmentIds, pendingSpecId, model }`
- **AND** a loading toast is shown until the ticket is generated

#### Scenario: Quick supports attachments
- **WHEN** the user attaches a file in Quick mode and submits
- **THEN** the attachment ids are included in the request payload
- **AND** the attachments are bound to the new ticket on success

#### Scenario: Quick forwards selected model
- **WHEN** the user picks a non-default model in the Add Spec picker and submits in Quick mode
- **THEN** the request body's `model` field equals the picker's selected value

## ADDED Requirements

### Requirement: Explore launch payload carries the selected model

The Explore launch handoff (the `onExploreLaunch` payload from the Add Spec modal to the parent that owns `ExploreSpecShell`) SHALL include the model selected in the Add Spec picker as `model: string`. The Explore conversation MUST be created with that model as its `model` field, and the model MUST remain fixed for every assistant turn in that conversation for the lifetime of the conversation.

#### Scenario: Payload includes model
- **WHEN** the user picks `opus` and clicks `Continue` in Explore mode
- **THEN** the `ExploreLaunchPayload` passed to `onExploreLaunch` includes `model: "opus"`

#### Scenario: Conversation seeded with chosen model
- **WHEN** the Explore conversation is created from the launch payload
- **THEN** the persisted conversation row's `model` equals the launch payload's `model`

#### Scenario: Subsequent turns reuse the seeded model
- **GIVEN** an Explore conversation seeded with `model: "haiku"`
- **WHEN** the user sends additional messages
- **THEN** every assistant turn is generated using `haiku`
- **AND** no UI surface changes the conversation's model mid-flow
