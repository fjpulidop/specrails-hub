# Common CI Failure Patterns & Fixes

## 1. Client test files break `cd client && npm run build`

**Pattern:** Test files (`.test.tsx`, `.test.ts`, `.spec.tsx`) placed inside `client/src/` are picked up by the root `tsconfig.json` include `["src"]` and compiled during `npm run build`. This causes TS errors for missing testing-library types, jest-dom matchers, etc.

**Fix:** Add `exclude` to `client/tsconfig.json`:
```json
"exclude": ["src/**/*.test.ts", "src/**/*.test.tsx", "src/**/*.spec.ts", "src/**/*.spec.tsx"]
```

**Why it bites:** The client has no `include` glob for test files — it includes the whole `src/` directory, so test files sneak in.

**File pattern:** `client/tsconfig.json`, `client/src/**/*.test.tsx`

---

## 2. `ReturnType<typeof vi.spyOn>` is too broad for overloaded Node.js `fs` functions

**Pattern:** Declaring spy variables as `ReturnType<typeof vi.spyOn>` in server test files that spy on `fs.existsSync`, `fs.readdirSync`, `fs.readFileSync` causes TypeScript errors because the inferred `MockInstance<OverloadedFn>` is not assignable to the generic `MockInstance<(this: unknown, ...args: unknown[]) => unknown>`.

**Fix:** Type spy variables as `any` with an explicit comment:
```ts
// Spy references — typed as any to avoid overloaded-signature inference conflicts
let existsSyncSpy: any
let readdirSyncSpy: any
let readFileSyncSpy: any
```

**Alternative:** If strict typing is needed, use `vi.SpyInstance` from vitest directly.

**File pattern:** `server/**/*.test.ts` when spying on `fs` methods.

---

## 3. Client test files may have future-infra note but still break typecheck if not excluded

**Pattern:** A test file may be intentionally "parked" (not yet runnable) but still gets type-checked by the client `tsc`. Even if the file is excluded from vitest via config, `tsc` still sees it unless the tsconfig excludes it.

**Prevention rule:** Before adding a `.test.tsx` to `client/src/`, always verify that `client/tsconfig.json` has an exclude for test globs OR verify the file is unreachable by the include patterns.

---

## 4. Missing `useMemo` on small derived lists — acceptable, deferred pattern

**Pattern:** Frontend reviewers flag inline `.sort()` / `.filter()` on server-fetched arrays in React render bodies as missing `useMemo`. The `CommandGrid` component computes `visibleCommands`, `bySlug`, `discovery`, `delivery`, and `others` on every render pass without memoization.

**Decision:** Accepted as-is. The command list is server-fetched and always < 20 items. A `.sort()` on < 20 items takes microseconds. The component only re-renders when `commands` prop changes (new fetch) or when `othersOpen` state flips — neither is high-frequency.

**Rule:** Small-list derived computations (< 50 items) in low-frequency-render components do not require `useMemo` in this codebase. Add `useMemo` only when there is a measurable rendering bottleneck (profiler evidence) or when the derivation is computationally expensive (e.g., diffing large trees, complex string parsing).

**File pattern:** `client/src/components/*.tsx` — inline sort/filter on server-fetched arrays.
