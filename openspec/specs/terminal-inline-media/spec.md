# terminal-inline-media Specification

## Purpose
Enable inline image rendering inside terminal sessions via the Sixel and iTerm2 inline-image protocols, with bounded memory and a hot-reload-aware settings gate.

## Requirements

### Requirement: Inline image rendering via Sixel and iTerm2 protocols
The terminal SHALL load `@xterm/addon-image` for every session when `terminal_settings.imageRendering` resolves to `true`. The addon MUST be configured to accept both the Sixel protocol and the iTerm2 inline-image protocol (OSC 1337 `File=…`). The decoded image MUST render inline in the terminal grid, occupying the cells emitted by the underlying sequence. When `imageRendering` is `false`, the addon MUST NOT be loaded and inline-image bytes MUST pass through to xterm where they will be rendered as escape codes (the existing fallback behaviour).

#### Scenario: Sixel image renders inline
- **WHEN** the PTY emits a valid Sixel byte stream (`\x1bP…q…\x1b\\`) and image rendering is enabled
- **THEN** the bitmap renders inline at the cursor position, scaled to the cell grid as encoded by the sequence
- **AND** scrolling the buffer scrolls the image with it

#### Scenario: iTerm2 inline image renders
- **WHEN** the PTY emits `\x1b]1337;File=name=cat.png;inline=1;width=auto;height=auto:<base64>\x07`
- **THEN** the addon decodes the base64 PNG and renders it inline

#### Scenario: Image rendering disabled passes through
- **WHEN** `imageRendering = false` and the same iTerm2 sequence arrives
- **THEN** xterm renders the literal escape characters (no addon decoding)

### Requirement: Image memory cap
The image addon SHALL be configured with a per-frame pixel limit and a total in-flight cache cap. Defaults: 8 megapixels per frame, 32 MB total cache. When a single image exceeds the per-frame limit it MUST be skipped (not partially rendered) and a warn-level log line MUST be emitted. When the total cache cap is reached, the oldest cached images MUST be evicted FIFO.

#### Scenario: Oversized image skipped with warning
- **WHEN** an inline image declares dimensions whose product exceeds 8 megapixels
- **THEN** the addon does not allocate decode memory for it, a warning is logged once per session, and the binary stream forwarded to xterm is byte-identical (xterm renders escape codes as fallback)

#### Scenario: Total cache cap evicts oldest
- **WHEN** the in-flight cache reaches 32 MB and a new image is decoded
- **THEN** the oldest cached image is freed before the new one is admitted

### Requirement: Image rendering settings hot-reload
Toggling `terminal_settings.imageRendering` SHALL take effect on the *next* spawned PTY session. Existing live sessions SHALL retain their boot-time addon state until they are closed.

#### Scenario: New session honours latest setting
- **WHEN** the user toggles image rendering off in settings while session A is open
- **THEN** session A continues to render images normally
- **AND** a newly created session B does not load the image addon
