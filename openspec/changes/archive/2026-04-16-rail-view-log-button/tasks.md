## 1. RailControls Implementation

- [x] 1.1 Read `RailControls.tsx` to understand current prop interface and button layout
- [x] 1.2 Add `useNavigate` import from `react-router-dom` if not already present
- [x] 1.3 Add `ScrollText` icon import from `lucide-react`
- [x] 1.4 Conditionally render the View Log button when `railJob?.status === 'running'`, positioned left of the Implement/Batch toggle
- [x] 1.5 Wire button `onClick` to `navigate('/jobs/${railJob.jobId}')`
- [x] 1.6 Style button: `text-dracula-cyan`, hover glow `hover:shadow-[0_0_8px_hsl(191_97%_77%/0.4)]`, size/padding matching the Play/Stop button

## 2. Verification

- [x] 2.1 Confirm button renders only when `status === 'running'` (not queued, completed, failed)
- [x] 2.2 Confirm button click navigates to correct job detail page
- [x] 2.3 Confirm button disappears when rail stops
- [x] 2.4 Run `npm run typecheck` — no errors
