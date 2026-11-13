# Original User Request

## Initial Request — 2026-10-14T17:30:43Z

Investigate and fix the Interview Coach camera auto-framing so face, eyes, and cheekbones remain visible during movement. Test camera framing in the browser and independently review changes while preserving existing college portal and student login.

Working directory: /home/abdul-aleem-arshad-mohammed/Work/Interview_coach
Integrity mode: development

## Requirements

### R1. Continuous Visibility of Face, Eyes, and Cheekbones
Camera auto-framing must dynamically calculate scale and pan coordinates so the face contour, eyes, irises, and cheekbone prominence landmarks remain comfortably inside the visible viewport with safe boundary margins during horizontal, vertical, and distance movement.

### R2. Jitter-Free Pan-Tilt-Zoom and Dynamic Framing Adjustment
Replace unstable transform-origin shifts with stable virtual PTZ (translation and scale) and smooth temporal interpolation across frames. If a candidate moves toward camera edges where panning reaches physical sensor bounds, zoom must automatically adapt to prevent cropping facial features.

### R3. Authentication & Scope Preservation
Preserve existing login, ECAP college portal authentication, and session handling without modification. Do not push commits or deploy to any remote environment.

## Acceptance Criteria

### Facial Landmark Framing
- [ ] Face oval, eyes, and cheekbones remain entirely within the visible viewport bounds (margin >= 5% from all viewport edges) during simulated left, right, up, and down candidate motion.
- [ ] Camera preview stage translates and scales smoothly without black viewport margins or jarring transform-origin jumps.
- [ ] Status indicators accurately report centered vs off-center vs no-face states.

### Verification & Regression Guardrails
- [ ] Automated Playwright browser tests verify camera tracking, landmark detection, and framing across movement scenarios.
- [ ] All existing auth, college portal, and interview regression tests pass cleanly (npm test and tests/browser/platform.spec.ts).
- [ ] Independent code, security, and test reviews confirm no regressions or unintended side effects.
