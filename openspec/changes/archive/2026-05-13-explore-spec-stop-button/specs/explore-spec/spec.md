## ADDED Requirements

### Requirement: ExploreSpec composer exposes a Stop affordance while streaming

While an Explore Spec turn is streaming (`conversation.isStreaming === true`) **and** the conversation already has more than one message (i.e. at least one prior user turn has completed and a new user turn is being processed), the composer SHALL present a Stop control in the same DOM slot as the Send button. The very first (bootstrap) streaming turn of a conversation — when `conversation.messages.length <= 1` — SHALL NOT expose a Stop control, because cancelling the priming turn would leave the conversation in an unusable half-initialised state. Activating the Stop control SHALL cancel the in-flight assistant turn by calling `useChat.abortStream(conversationId)`, which `DELETE`s `/api/projects/:projectId/chat/conversations/:id/messages/stream`. The Stop control SHALL be enabled regardless of whether the composer textarea contains text, because the user MUST be able to interrupt without having to type a new message first. When `isStreaming` flips back to `false`, the composer SHALL revert to the Send affordance, preserving any text the user typed during the streaming interval.

#### Scenario: Stop button replaces Send while streaming

- **WHEN** the user submits an Explore Spec turn and the server begins streaming (`conversation.isStreaming` flips to `true`)
- **THEN** the composer's Send button SHALL be replaced in place by a Stop button styled with the destructive (red) variant
- **AND** the Stop button SHALL be enabled even if the composer textarea is empty

#### Scenario: Click on Stop cancels the in-flight turn

- **WHEN** the user clicks the Stop button while streaming
- **THEN** the client SHALL invoke `useChat.abortStream(conversation.id)`, which issues `DELETE /chat/conversations/:id/messages/stream`
- **AND** the server SHALL terminate the spawned `claude` child via the existing `ChatManager.abort` path
- **AND** any assistant output already rendered SHALL remain visible

#### Scenario: Stop is hidden during the bootstrap turn

- **WHEN** the user opens an Explore Spec shell and the slash-command bootstrap turn is streaming, with `conversation.messages.length <= 1`
- **THEN** the composer SHALL NOT render a Stop button
- **AND** the keybind `⌘⏎` / `Ctrl+⏎` SHALL NOT trigger `abortStream` during this window

#### Scenario: Send affordance restored after streaming ends

- **WHEN** `conversation.isStreaming` transitions from `true` back to `false` (either because the turn completed naturally or because the user pressed Stop)
- **THEN** the composer SHALL re-render the Send button in the same DOM slot
- **AND** any text the user typed into the composer during the streaming interval SHALL still be present

### Requirement: ⌘⏎ / Ctrl+⏎ triggers Stop while streaming

The `Cmd+Enter` (macOS) / `Ctrl+Enter` (other platforms) keybind inside the Explore Spec composer SHALL be context-sensitive: while `conversation.isStreaming === false`, it submits the composer text exactly as today; while `conversation.isStreaming === true`, it cancels the in-flight turn via the same `abortStream` call as the Stop button. The keybind hint displayed next to the action label SHALL remain visible in both states so the affordance is discoverable from muscle memory.

#### Scenario: ⌘⏎ submits while idle

- **WHEN** the user presses `Cmd+Enter` (or `Ctrl+Enter`) while `conversation.isStreaming` is `false` and the composer contains non-whitespace text
- **THEN** the composer SHALL submit the message exactly as today (existing behaviour, unchanged)

#### Scenario: ⌘⏎ aborts while streaming

- **WHEN** the user presses `Cmd+Enter` (or `Ctrl+Enter`) while `conversation.isStreaming` is `true`
- **THEN** the client SHALL invoke `useChat.abortStream(conversation.id)` instead of submitting any composer text
- **AND** any text currently in the composer SHALL be preserved (not consumed by the keybind)
