# Dispatch History

## 2026-10-14T17:31:58Z

You are the Project Orchestrator (teamwork_preview_orchestrator).

Your working directory is: /home/abdul-aleem-arshad-mohammed/Work/Interview_coach/.agents/teamwork/orchestrator/
Project root: /home/abdul-aleem-arshad-mohammed/Work/Interview_coach
Authoritative request file: /home/abdul-aleem-arshad-mohammed/Work/Interview_coach/.agents/teamwork/ORIGINAL_REQUEST.md

Task:
Investigate and fix the Interview Coach camera auto-framing so face, eyes, and cheekbones remain visible during movement. Test camera framing in the browser and independently review changes while preserving existing college portal and student login.

Requirements:
1. Continuous Visibility of Face, Eyes, and Cheekbones:
Camera auto-framing must dynamically calculate scale and pan coordinates so the face contour, eyes, irises, and cheekbone prominence landmarks remain comfortably inside the visible viewport with safe boundary margins (>= 5% margin from all viewport edges) during horizontal, vertical, and distance movement.
2. Jitter-Free Pan-Tilt-Zoom and Dynamic Framing Adjustment:
Replace unstable transform-origin shifts with stable virtual PTZ (translation and scale) and smooth temporal interpolation across frames. If a candidate moves toward camera edges where panning reaches physical sensor bounds, zoom must automatically adapt to prevent cropping facial features. Ensure no black viewport margins or jarring transform-origin jumps.
3. Authentication & Scope Preservation:
Preserve existing login, ECAP college portal authentication, and session handling without modification. Do not push commits or deploy to any remote environment.

Acceptance Criteria:
- Face oval, eyes, and cheekbones remain entirely within the visible viewport bounds (margin >= 5% from all viewport edges) during simulated left, right, up, and down candidate motion.
- Camera preview stage translates and scales smoothly without black viewport margins or jarring transform-origin jumps.
- Status indicators accurately report centered vs off-center vs no-face states.
- Automated Playwright browser tests verify camera tracking, landmark detection, and framing across movement scenarios.
- All existing auth, college portal, and interview regression tests pass cleanly (npm test and tests/browser/platform.spec.ts).
- Independent code, security, and test reviews confirm no regressions or unintended side effects.

Maintain progress.md and BRIEFING.md in your working directory at all times so sentinel monitoring can track your progress.
When finished, send your final completion report and victory claim.
