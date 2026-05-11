## ADDED Requirements

### Requirement: Save-as-Draft demotes a non-draft ticket in place when `editTicketId` is supplied

The `POST /:projectId/tickets/save-as-draft` endpoint SHALL accept an optional `editTicketId: number` field on the request body. When `editTicketId` is provided AND a ticket with that id exists in the project's local ticket store, the endpoint MUST update **that ticket** in place (preserving its `id`, `created_at`, `created_by`, `source`, `assignee`, `prerequisites`, `metadata`, and `comments`) and MUST set:

- `status` → `'draft'`
- `priority` → `null`
- `origin_conversation_id` → the request's `conversationId`
- `title` / `description` / `labels` → the values supplied on the body, using the same merge rules as the existing endpoint (provided title falls back to the existing title or the auto-generated title; description and labels are replaced when supplied)
- `updated_at` → the current ISO timestamp

The endpoint MUST NOT insert a new ticket when `editTicketId` is provided. The endpoint MUST NOT consult the existing `(origin_conversation_id, status='draft')` lookup when `editTicketId` is provided. The endpoint MUST broadcast a `ticket_updated` WebSocket message for the demoted ticket. The response status MUST be 200 OK (not 201) when an existing ticket is updated, and the response body MUST contain the updated ticket.

#### Scenario: Save as Draft on a `todo` ticket flips it to draft in place

- **WHEN** the client posts to `/tickets/save-as-draft` with `{ conversationId, editTicketId, title, description, labels }`
- **AND** the ticket identified by `editTicketId` exists with `status='todo'` and `priority='high'`
- **THEN** the response status is 200
- **AND** the same ticket id is returned
- **AND** the persisted ticket has `status='draft'`, `priority=null`, `origin_conversation_id=conversationId`
- **AND** the persisted ticket retains its original `created_at`, `created_by`, and `source`
- **AND** a `ticket_updated` WebSocket message is broadcast carrying the demoted ticket

#### Scenario: Save as Draft on a `backlog` ticket flips it to draft in place

- **WHEN** the client posts to `/tickets/save-as-draft` with `{ conversationId, editTicketId }`
- **AND** the ticket identified by `editTicketId` exists with `status='backlog'`
- **THEN** the persisted ticket has `status='draft'` and `priority=null`
- **AND** no new ticket is inserted into the store
- **AND** the response carries the same `id` that was supplied

#### Scenario: `editTicketId` resolving to a missing ticket returns 404

- **WHEN** the client posts to `/tickets/save-as-draft` with `editTicketId=999999`
- **AND** no ticket with id 999999 exists in the project's store
- **THEN** the response status is 404
- **AND** no ticket is inserted or modified
- **AND** no WebSocket message is broadcast

#### Scenario: `editTicketId` of the wrong type returns 400

- **WHEN** the client posts to `/tickets/save-as-draft` with `editTicketId="abc"`
- **THEN** the response status is 400
- **AND** no ticket is inserted or modified

### Requirement: Save-as-Draft is idempotent for repeated demotions on the same ticket

When the `POST /:projectId/tickets/save-as-draft` endpoint receives a second request with the same `editTicketId` and `conversationId`, and the ticket is already `status='draft'` with the same `origin_conversation_id`, it SHALL succeed with 200, update only the supplied `title` / `description` / `labels` (and `updated_at`), MUST NOT insert a new ticket, MUST NOT change `priority` (it remains `null`), MUST NOT change `status`, and MUST broadcast `ticket_updated`.

#### Scenario: Second save in the same session does not duplicate the ticket

- **WHEN** the client posts `/tickets/save-as-draft` twice with the same `(editTicketId, conversationId)` in the same Explore session
- **THEN** both requests return 200
- **AND** the project's ticket store contains exactly one ticket with id `editTicketId` after both requests
- **AND** the ticket's `status` is `draft` and `priority` is `null`
- **AND** the ticket's `title`/`description`/`labels` reflect the second request's payload

#### Scenario: Save-as-Draft on a ticket already in draft is a no-op flip

- **WHEN** the client opens an already-`draft` ticket via Continue Editing and clicks Save as Draft
- **AND** posts `/tickets/save-as-draft` with `editTicketId` for that draft and the current `conversationId`
- **THEN** the response status is 200
- **AND** the ticket's `status` remains `draft`
- **AND** the ticket's `priority` remains `null`
- **AND** the ticket's `origin_conversation_id` is updated to the current `conversationId`

### Requirement: Save-as-Draft without `editTicketId` preserves the original fresh-session behaviour

When `editTicketId` is absent from the `POST /:projectId/tickets/save-as-draft` request body, the endpoint SHALL behave exactly as before this change: it MUST look up an existing ticket by `(origin_conversation_id === conversationId AND status === 'draft')`, update it in place if found, or insert a new draft ticket if not. The response code, broadcast type, and persisted shape MUST be unchanged from the prior behaviour.

#### Scenario: Fresh Explore session without `editTicketId` still inserts a new draft

- **WHEN** the client posts `/tickets/save-as-draft` with `{ conversationId }` and no `editTicketId`
- **AND** no draft ticket exists with `origin_conversation_id === conversationId`
- **THEN** a new draft ticket is inserted with the next sequential id
- **AND** the response status is 201
- **AND** a `ticket_created` WebSocket message is broadcast

#### Scenario: Repeated save in the same fresh session updates the same draft

- **WHEN** the client posts `/tickets/save-as-draft` twice with the same `conversationId` and no `editTicketId`
- **THEN** the project's ticket store contains exactly one draft ticket whose `origin_conversation_id` matches `conversationId`
- **AND** the second response carries the same ticket id as the first

### Requirement: ExploreSpecShell sends `editTicketId` whenever it is in edit mode

The `ExploreSpecShell` component's Save-as-Draft handler SHALL include `editTicketId: editTicket.id` in the `POST /tickets/save-as-draft` request body whenever the shell was mounted with a non-null `editTicket` prop. When the shell was NOT mounted in edit mode, the handler MUST omit `editTicketId` entirely (sending it as `undefined` or `null` is not acceptable; the field must be absent).

#### Scenario: Continue-Editing flow sends `editTicketId`

- **WHEN** the user opens a `todo` ticket via Continue Editing in `TicketDetailModal`
- **AND** clicks Save as Draft inside the resulting `ExploreSpecShell`
- **THEN** the outgoing request body contains `editTicketId` equal to that ticket's id

#### Scenario: Fresh Explore session does not send `editTicketId`

- **WHEN** the user opens a fresh Explore session from the SpecsBoard "+ Add Spec" entry point
- **AND** clicks Save as Draft
- **THEN** the outgoing request body does not contain an `editTicketId` field
