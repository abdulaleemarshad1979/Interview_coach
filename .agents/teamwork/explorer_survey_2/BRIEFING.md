# BRIEFING — 2026-10-14T17:40:00Z

## Mission
Investigate status indicators, viewport bounds, margins, dynamic framing adjustments, and smooth temporal interpolation for Interview Coach camera auto-framing.

## 🔒 My Identity
- Archetype: explorer
- Roles: investigation, synthesis
- Working directory: /home/abdul-aleem-arshad-mohammed/Work/Interview_coach/.agents/teamwork/explorer_survey_2
- Original parent: cbae87ec-acec-45a8-83f4-ee3f3c76b5c3
- Milestone: camera-autoframing-survey

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Preserve existing login, ECAP college portal authentication, and session handling without modification
- Do not push commits or deploy to any remote environment
- Accurate findings with exact file paths and line numbers

## Current Parent
- Conversation ID: cbae87ec-acec-45a8-83f4-ee3f3c76b5c3
- Updated: 2026-10-14T17:40:00Z

## Investigation State
- **Explored paths**:
  - `src/components/CameraObserver.tsx`: core camera and face tracking component
  - `src/index.css`: `.coach-camera-preview`, `.coach-camera-stage`, `.coach-hud-overlay`
  - `tests/browser/platform.spec.ts`: Playwright tests for camera observer and college portal
  - `playwright.config.ts` & `tests/support/runtime.ts`: isolated test harness
  - `src/components/AdaptiveInterviewPage.tsx` & `MeetingLobby.tsx`: CameraObserver usage sites
- **Key findings**:
  - `CameraObserver.tsx:269`: `isCentered` tests only `midX >= 0.35 && midX <= 0.65`, ignoring vertical position (`midY`) and viewport boundary margins.
  - `CameraObserver.tsx:357-360`: Unstable dynamic `transform-origin` with competing easing curves (`cubic-bezier` vs `ease-out`) causes jarring jumps.
  - Lack of viewport-space safe zone check (margin >= 5% from all edges) for face oval, eyes, and cheekbones.
  - Absence of edge-adaptive auto-zoom: when panning hits physical sensor bounds to avoid black margins, zoom does not adaptively reduce, causing facial feature cropping.
  - `CameraObserver.tsx:250`: 200ms detection interval with immediate state flipping to `no-face` on single dropped frame; missing temporal hysteresis and EMA smoothing.
- **Unexplored areas**:
  - All four focus areas investigated thoroughly.

## Key Decisions Made
- Formulated closed-form virtual PTZ model with fixed `50% 50%` origin, strict boundary clamping $|t| \le \frac{s - 1}{2}$, dynamic zoom reduction on edge proximity, and rAF-driven EMA smoothing with deadbands.

## Artifact Index
- /home/abdul-aleem-arshad-mohammed/Work/Interview_coach/.agents/teamwork/explorer_survey_2/handoff.md — Final investigation report
