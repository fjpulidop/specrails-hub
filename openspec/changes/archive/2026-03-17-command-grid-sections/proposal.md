---
id: command-grid-sections
title: "CommandGrid: Discovery & Delivery Sections"
status: proposed
github_issue: 10
date: 2026-03-17
---

# CommandGrid: Discovery & Delivery Sections

## Summary

Reorganize the Home screen's `CommandGrid` component into two clearly differentiated, visually attractive sections — **Discovery** and **Delivery** — with correct command ordering, display name overrides, and removal of the dead `propose-feature` command from Others.

## Motivation

The current command grid is visually flat. All commands appear at the same level with no meaningful hierarchy separating exploratory (spec management) workflows from execution (implementation) workflows. Specific problems:

1. Section headers are rendered as plain `<h3>` tags with `text-[10px] uppercase` — too small and visually indistinct to communicate section intent.
2. `propose-spec` is entirely missing from the Discovery section; it falls through to Others because it is not in `DISCOVERY_SLUGS`.
3. `update-product-driven-backlog` and `product-backlog` display their raw command names rather than user-friendly equivalents ("Auto-propose Specs", "Auto-Select Specs").
4. `propose-feature` is a dead command (no handler) that still appears in Others, polluting the UI.
5. Command ordering within Discovery and Delivery sections is non-deterministic (filtered array order follows server response order).

## Desired Outcome

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│  ●  DISCOVERY                                       │
│     Explore & define your product                   │
│  ────────────────────────────────── (cyan line)     │
│                                                     │
│  [✨ Propose a Spec  →]  [⚡ Auto-propose Specs  ▶] │
│  [📋 Auto-Select Specs  ▶]                          │
│                                                     │
│  ●  DELIVERY                                        │
│     Build & ship features                           │
│  ────────────────────────────────── (purple line)   │
│                                                     │
│  [🚀 Implement       →]  [⚡ Batch-Implement     →] │
│                                                     │
│  ▸ Others (N)                                       │
└─────────────────────────────────────────────────────┘
```

## Non-Goals

- No changes to the server, CLI, or any file outside `CommandGrid.tsx`.
- No changes to how commands are fetched or the `CommandInfo` type.
- No changes to the wizard flow triggered by clicking commands.
- No redesign of the command card itself (icon, glow, tooltip remain unchanged).
- No addition of new icons beyond updating the `propose-spec` entry in `COMMAND_META`.

## Risks

Low. All changes are purely cosmetic and organizational, isolated to a single client component. No API surface, no data model, no shared state is modified.
