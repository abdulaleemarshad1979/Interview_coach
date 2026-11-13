# Camera Auto-Framing Survey: Status Indicators, Viewport Bounds, Dynamic Framing, and Smooth Temporal Interpolation

## 1. Observation

### 1.1 Status Indicators and Centering Logic
In `src/components/CameraObserver.tsx`:
- Lines 5-6 & 14-22 define the status types and user-facing labels:
  ```typescript
  type CameraStatus = 'off' | 'starting' | 'loading' | 'no-face' | 'centered' | 'off-center' | 'unavailable';
  type ZoomMode = 'auto' | '1x' | '1.4x' | '1.8x';

  const labels: Record<CameraStatus, string> = {
    off: 'Camera is off',
    starting: 'Opening your camera…',
    loading: 'Loading face tracking…',
    'no-face': 'Camera on · no face in frame',
    centered: 'Face tracked · centered in frame',
    'off-center': 'Face tracked · move toward the center',
    unavailable: 'Camera on · face tracking unavailable',
  };
  ```
- Lines 259-271 calculate bounding coordinates, center point, and status:
  ```typescript
  const xs = face.map(point => point.x);
  const ys = face.map(point => point.y);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);

  const midX = (left + right) / 2;
  const midY = (top + bottom) / 2;
  const faceH = Math.max(0.15, bottom - top);
  const isCentered = midX >= 0.35 && midX <= 0.65;
  setStatus(isCentered ? 'centered' : 'off-center');
  ```
- Lines 297-307 reset status immediately on any missed detection:
  ```typescript
  } else {
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    setStatus('no-face');
    setTransform({ scale: 1.0, originX: 50, originY: 50, shiftY: 0 });
    setFaceMetrics({
      faceDetected: false,
      eyesDetected: false,
      cheeksDetected: false,
      scale: 1.0,
    });
  }
  ```
- Lines 375-392 display live HUD status badges:
  ```tsx
  {status !== 'off' && (
    <div className="coach-hud-overlay">
      <div className="coach-hud-badges">
        {faceMetrics.faceDetected ? (
          <>
            <span className="coach-hud-pill emerald" title="Face contour tracking active">
              <span className="coach-hud-dot" /> Face
            </span>
            <span className="coach-hud-pill sky" title="Eyes and iris tracking active">
              <span className="coach-hud-dot" /> Eyes
            </span>
            <span className="coach-hud-pill purple" title="Cheekbones and zygomatic arches active">
              <span className="coach-hud-dot" /> Cheekbones
            </span>
          </>
        ) : (
          <span className="coach-hud-pill muted">Scanning…</span>
        )}
      </div>
      ...
    </div>
  )}
  ```
- Lines 291-296 set `eyesDetected` and `cheeksDetected` unconditionally to `true` whenever `face.length > 0`:
  ```typescript
  setFaceMetrics({
    faceDetected: true,
    eyesDetected: true,
    cheeksDetected: true,
    scale: targetScale,
  });
  ```

### 1.2 Viewport Bounds and Transform Origin Mechanics
In `src/components/CameraObserver.tsx`:
- Lines 283-290 calculate dynamic transform origins and vertical shifts:
  ```typescript
  // Mirrored horizontal center (scaleX(-1)): visual x = 1 - midX
  const visualCenterX = 1 - midX;
  const visualCenterY = midY;
  const originX = Math.round(Math.max(15, Math.min(85, visualCenterX * 100)));
  const originY = Math.round(Math.max(20, Math.min(80, visualCenterY * 100)));
  const shiftY = targetScale > 1.0 ? Math.round(Math.max(-25, Math.min(25, (0.42 - visualCenterY) * 100 * (1 - 1 / targetScale)))) : 0;

  setTransform({ scale: targetScale, originX, originY, shiftY });
  ```
- Lines 354-365 render the stage with shifting origin and conflicting CSS transitions:
  ```tsx
  <div
    className="coach-camera-stage"
    style={{
      transform: `scale(${transform.scale}) translateY(${transform.shiftY}%)`,
      transformOrigin: `${transform.originX}% ${transform.originY}%`,
      transition: 'transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), transform-origin 0.35s ease-out',
    }}
  >
    <video ref={videoRef} autoPlay muted playsInline aria-label="Your live camera preview" />
    <canvas ref={canvasRef} aria-hidden="true" />
  </div>
  ```
In `src/index.css`:
- Lines 40-44 define the preview container and stage layout:
  ```css
  .coach-camera-preview { position: relative; width: min(100%, 560px); aspect-ratio: 16 / 9; overflow: hidden; border-radius: .65rem; background: #0f172a; }
  .coach-camera-stage { position: absolute; inset: 0; width: 100%; height: 100%; }
  .coach-camera-preview video, .coach-camera-preview canvas { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; transform: scaleX(-1); }
  .coach-camera-preview canvas { pointer-events: none; }
  .coach-camera-placeholder { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: .75rem; color: #cbd5e1; }
  ```

### 1.3 Key Facial Landmark Indices
In `src/components/CameraObserver.tsx`:
- Lines 24-32 define cheekbone landmarks:
  ```typescript
  const LEFT_CHEEKBONE_CONNECTIONS: Array<[number, number]> = [
    [116, 123], [123, 147], [147, 187], [187, 205], [205, 50], [50, 101],
  ];
  const RIGHT_CHEEKBONE_CONNECTIONS: Array<[number, number]> = [
    [345, 352], [352, 376], [376, 411], [411, 425], [425, 280], [280, 330],
  ];
  const LEFT_CHEEK_POINTS = [116, 123, 187, 50, 205];
  const RIGHT_CHEEK_POINTS = [345, 352, 411, 280, 425];
  ```
- Lines 56, 69, 94 draw face oval, eyes, and irises:
  - `FaceLandmarker.FACE_LANDMARKS_FACE_OVAL` (36 contour connections)
  - `FaceLandmarker.FACE_LANDMARKS_LEFT_EYE` & `RIGHT_EYE`
  - `FaceLandmarker.FACE_LANDMARKS_LEFT_IRIS` & `RIGHT_IRIS`

### 1.4 Dynamic Framing & Detection Timing
In `src/components/CameraObserver.tsx`:
- Lines 250-252 throttle tracking execution to 200ms intervals (5 FPS):
  ```typescript
  timestamp - lastDetection >= 200 &&
  video.currentTime !== lastVideoTime
  ```
- Lines 275-281 calculate zoom purely from vertical face height without considering proximity to camera sensor edges:
  ```typescript
  const mode = zoomModeRef.current;
  let targetScale = 1.0;
  if (mode === 'auto') {
    targetScale = Math.min(2.1, Math.max(1.0, 0.52 / faceH));
  } else if (mode === '1.4x') {
    targetScale = 1.4;
  } else if (mode === '1.8x') {
    targetScale = 1.8;
  }
  ```

### 1.5 Existing Browser Verification Suite
In `tests/browser/platform.spec.ts`:
- Lines 31-35 verify camera off and no-face states:
  ```typescript
  await page.getByRole('button', { name: 'Start camera' }).click();
  await expect.poll(() => page.getByLabel('Your live camera preview').evaluate((video: HTMLVideoElement) => video.videoWidth)).toBeGreaterThan(0);
  await expect(page.getByText('Camera on · no face in frame')).toBeVisible({ timeout: 30000 });
  await page.getByRole('button', { name: 'Turn camera off' }).click();
  await expect(page.getByText('Camera is off')).toBeVisible();
  ```
- Lines 42-61 verify centered face tracking using `assets/abdul_profile.png`:
  ```typescript
  test('camera observer tracks a visible face using local model assets', async ({ page, request }) => {
    ...
    const image = `data:image/png;base64,${readFileSync('assets/abdul_profile.png').toString('base64')}`;
    await page.evaluate(async (source) => {
      const portrait = await createImageBitmap(await (await fetch(source)).blob());
      const canvas = document.createElement('canvas');
      canvas.width = 640; canvas.height = 480;
      const context = canvas.getContext('2d')!;
      const paint = () => context.drawImage(portrait, 0, -80, 640, 640);
      paint(); window.setInterval(paint, 100);
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => canvas.captureStream(10) });
    }, image);
    await page.getByRole('button', { name: 'Start camera' }).click();
    await expect(page.getByText('Face tracked · centered in frame')).toBeVisible({ timeout: 30000 });
    await expect.poll(() => page.locator('.coach-camera-preview canvas').evaluate((canvas: HTMLCanvasElement) => canvas.width)).toBeGreaterThan(0);
  });
  ```
- Command execution: `npx playwright test tests/browser/platform.spec.ts -g "camera observer"` passed in 4.1s (6.8s total).

---

## 2. Logic Chain

### 2.1 Flaws in Status Indicator Reporting
1. **Vertical blindness** (`CameraObserver.tsx:269`): `isCentered` evaluates only horizontal coordinate `midX >= 0.35 && midX <= 0.65`. If a candidate ducks down (`midY = 0.90`) or stands up (`midY = 0.10`), the system falsely reports `centered` ("Face tracked · centered in frame"). For interview coaching, vertical eye-level centering (upper third: $0.30 \le \text{midY} \le 0.60$) is essential.
2. **Raw sensor vs framed viewport discrepancy**: `isCentered` is evaluated strictly against raw camera sensor coordinates. When the candidate is zoomed in at 1.8x, the candidate could be framed dead-center by virtual PTZ, or conversely, virtual PTZ could be clamped against the physical sensor bound causing the candidate's face to be pushed to the edge of the viewport. The indicator does not check the candidate's position in the visible viewport.
3. **Threshold chatter / lack of hysteresis**: Boundary condition `midX = 0.35` has no deadband. When a candidate's position hovers around 0.35, normal detection noise ($\pm 1-2\%$) triggers constant flapping between `'centered'` and `'off-center'` every 200ms tick.
4. **Instant dropout on single-frame loss** (`CameraObserver.tsx:297`): Single missed detection frames (blinking, momentary lighting shift, or CPU delay) instantly set status to `'no-face'`, reset scale to 1.0, and clear the landmark canvas, leading to visual flickering.
5. **Fabricated badge presence** (`CameraObserver.tsx:293-294`): The HUD pills for "Eyes" and "Cheekbones" are hardcoded to `true` whenever any face is detected, rather than checking if eye landmarks and cheekbone prominence points are actually present and inside the visible viewport.

### 2.2 Viewport Bounds and the 5% Safe Zone Margin Requirement
1. **Geometric transformation chain**:
   - Camera frame: $x, y \in [0, 1]^2$
   - Horizontal mirroring: $x_{mirrored} = 1 - x$
   - Aspect ratio cover mapping: The preview container is $16:9$ (`index.css:40`), whereas webcams are typically $4:3$ ($640 \times 480$). With `object-fit: cover`, the vertical coverage fraction is $A_v / A_c = (4/3) / (16/9) = 0.75$. The top and bottom $12.5\%$ ($\Delta_{cropY} = 0.125$) of the sensor are cropped by default.
   - Stage PTZ transform: With a fixed origin $(0.5, 0.5)$, translation $(t_x, t_y)$, and scale $s$:
     $$u(p) = 0.5 + s \cdot (x_{stage, mirrored} - 0.5) + t_x$$
     $$v(p) = 0.5 + s \cdot (y_{stage} - 0.5) + t_y$$
2. **Safe zone margin ($\ge 5\%$)**:
   - Requirement R1 demands that the entire face oval, eyes/irises, and cheekbones remain $\ge 5\%$ away from all viewport edges:
     $$u_{min} \ge 0.05 \quad\text{and}\quad u_{max} \le 0.95$$
     $$v_{min} \ge 0.05 \quad\text{and}\quad v_{max} \le 0.95$$
   - `CameraObserver.tsx` has no viewport-space bounding calculation for these feature sets, meaning zoom can push cheekbones or eyes past the viewport boundary without the system detecting the violation.

### 2.3 Physical Sensor Bounds Clamping vs Dynamic Auto-Zoom
1. **Black margin prevention**:
   - To prevent black letterboxing/pillarboxing around the camera preview stage, the transformed video must always cover the container $[0, 1] \times [0, 1]$.
   - With fixed origin $(0.5, 0.5)$, the maximum permissible translation before black margins appear is:
     $$|t_x| \le \frac{s - 1}{2} \quad\text{and}\quad |t_y| \le \frac{s - 1}{2}$$
   - When $s = 1.0$, translation must be exactly 0.
2. **The boundary-panning conflict**:
   - When a candidate moves toward the edge of the camera sensor (e.g. left or right), the desired pan to center the face is $t_{x, desired} = -s \cdot (x_{center} - 0.5)$.
   - Once $|t_{x, desired}| > \frac{s - 1}{2}$, pan is clamped to $\pm \frac{s - 1}{2}$ to prevent black margins.
   - If zoom scale $s$ remains at $1.8\times$ or $2.1\times$, the candidate's face continues moving toward the viewport boundary and is cropped.
3. **Adaptive zoom reduction**:
   - When pan reaches the physical sensor boundary clamp, the auto-framing engine must automatically decrease zoom scale $s$ toward $1.0\times$.
   - As $s$ decreases, the visible field of view widens, bringing the facial contour, cheekbones, and eyes back inside the $5\%$ safe margin ($u \in [0.05, 0.95], v \in [0.05, 0.95]$).
   - If even at $s = 1.0\times$ the candidate is at the extreme edge of the physical webcam, the system cannot widen further; it clamps at $s = 1.0, t_x = 0, t_y = 0$ and triggers `'off-center'` status ("Face tracked · move toward the center").

### 2.4 State Transitions, Temporal Interpolation, and Origin Jumps
1. **Elimination of dynamic `transform-origin`** (`CameraObserver.tsx:358-360`):
   - Dynamically altering `transformOrigin` (`originX% originY%`) simultaneously with `scale` and `translateY` introduces nonlinear shifts because the pivot point moves while geometry scales.
   - `CameraObserver.tsx:360` pairs `cubic-bezier(0.16, 1, 0.3, 1)` on `transform` with `ease-out` on `transform-origin`. This curve mismatch creates visible hitches and jumps during head movement.
   - Fixing `transform-origin` to `50% 50%` and applying pure virtual PTZ via `translate3d(tx%, ty%, 0) scale(s)` completely eliminates origin jumping.
2. **Decoupled animation loop with Exponential Moving Average (EMA)**:
   - Detection runs asynchronously at 10-15 Hz (or whenever a frame arrives). It calculates target PTZ values: $(s_{target}, t_{x, target}, t_{y, target})$.
   - A `requestAnimationFrame` render loop runs continuously at 60 Hz, smoothly interpolating current values toward target values using time-delta independent exponential smoothing:
     $$\alpha = 1 - e^{-\lambda \cdot \Delta t}$$
     $$s_{curr} \leftarrow s_{curr} + \alpha \cdot (s_{target} - s_{curr})$$
     $$t_{x, curr} \leftarrow t_{x, curr} + \alpha \cdot (t_{x, target} - t_{x, curr})$$
     $$t_{y, curr} \leftarrow t_{y, curr} + \alpha \cdot (t_{y, target} - t_{y, curr})$$
     With $\lambda \approx 7.0$ ($\tau \approx 140\text{ms}$), transitions are fast yet fluid.
3. **Deadband filtering for stationary candidates**:
   - If $|\Delta x_{target}| < 0.015$ and $|\Delta s_{target}| < 0.03$, target values are not updated. This eliminates detection noise breathing and jitter when the user is seated still.
4. **Multi-frame persistence for dropout prevention**:
   - Maintain a dropout counter (or timestamp). Require at least 500ms (approx. 4-5 consecutive frames) of complete absence before transitioning from `centered`/`off-center` to `no-face` and smoothly easing zoom back to 1.0x.

---

## 3. Caveats

1. **Camera Sensor Aspect Ratio Variations**: Webcams report different aspect ratios (4:3 vs 16:9 vs 16:10). The coordinate mapping must read `video.videoWidth` and `video.videoHeight` at runtime rather than assuming 640x480.
2. **Head Pose / Extreme Profile**: If the candidate turns their head more than 60 degrees sideways, MediaPipe may track one cheekbone while the other is occluded. Cheekbone boundary calculations must safely handle partial landmark visibility.
3. **CPU Load on Low-End Devices**: Running face landmark detection on every video frame on low-power devices can strain the CPU. MediaPipe CPU delegate should continue to run on a throttled interval (e.g. 60-100ms / 10-15 FPS), while the visual PTZ transform interpolates at 60 FPS in the animation loop.
4. **Preservation Scope**: Authentication, ECAP college portal integration, session persistence, and server endpoints must remain completely untouched. All auto-framing changes are strictly localized to `src/components/CameraObserver.tsx` and `src/index.css`, with corresponding browser test enhancements in `tests/browser/platform.spec.ts`.

---

## 4. Conclusion

1. **Root cause of framing instability**: The current implementation uses dynamic `transform-origin` interpolation with mismatched CSS easing curves, an ad-hoc 200ms React state pump, no temporal smoothing, and zero viewport-space landmark margin enforcement.
2. **Status indicator deficiency**: Status calculation only tests horizontal `midX >= 0.35 && midX <= 0.65`, completely ignoring vertical alignment, edge proximity, safe margins, and temporal hysteresis.
3. **Cropping failure mode**: When a candidate moves toward camera edges, virtual pan is constrained by the video boundary to avoid black margins. Because auto-zoom does not scale down when pan reaches its physical bounds, facial features (face oval, cheekbones, eyes) get cropped against the viewport boundary.
4. **Architectural fix**:
   - Stabilize virtual PTZ with fixed center `transform-origin: 50% 50%`.
   - Implement mathematical physical bounds clamping $|t_x| \le \frac{s - 1}{2}$ and $|t_y| \le \frac{s - 1}{2}$.
   - Add dynamic auto-zoom reduction that reduces scale $s$ toward 1.0x as the candidate approaches the camera sensor boundary, guaranteeing $\ge 5\%$ viewport margin for all critical landmarks.
   - Implement continuous 60fps EMA interpolation with deadband thresholding and multi-frame dropout hysteresis.
   - Refine status reporting to check horizontal and vertical centering, safe zone margins, and dual-threshold hysteresis.

---

## 5. Recommended Implementation Strategy

### 5.1 Component Architecture in `src/components/CameraObserver.tsx`

#### A. Landmark Groups & Safe Zone Bounding Box
Define explicit landmark extraction for the 3 key feature groups:
1. **Face Oval**: Connection indices from `FaceLandmarker.FACE_LANDMARKS_FACE_OVAL`.
2. **Eyes & Irises**: Connection indices from `FACE_LANDMARKS_LEFT_EYE`, `FACE_LANDMARKS_RIGHT_EYE`, `FACE_LANDMARKS_LEFT_IRIS`, `FACE_LANDMARKS_RIGHT_IRIS`.
3. **Cheekbones**: Existing indices:
   - Left: `[116, 123, 147, 187, 205, 50, 101]`
   - Right: `[345, 352, 376, 411, 425, 280, 330]`

Helper to calculate the compound bounding box in stage space:
```typescript
interface StageBounds {
  minX: number; // visual mirrored x (0 = left, 1 = right)
  maxX: number;
  minY: number; // stage y (0 = top, 1 = bottom)
  maxY: number;
  centerX: number;
  centerY: number;
}
```

#### B. Stable Virtual PTZ and Dynamic Auto-Zoom Algorithm
```typescript
interface PTZTarget {
  scale: number;
  panX: number; // percentage (-50% to +50%)
  panY: number;
}

function computeFraming(
  bounds: StageBounds,
  mode: ZoomMode,
  aspectRatioCropY: number, // e.g. 0.125 for 4:3 in 16:9
): { ptz: PTZTarget; isCentered: boolean; hasSafeMargin: boolean } {
  // Desired eye-level vertical position in viewport (e.g. 0.40 - 0.44)
  const targetViewportY = 0.42;
  const targetViewportX = 0.50;

  // Base scale according to face height in auto mode, or fixed in manual modes
  const faceHeight = Math.max(0.12, bounds.maxY - bounds.minY);
  let baseScale = 1.0;
  if (mode === 'auto') {
    baseScale = Math.min(1.8, Math.max(1.0, 0.48 / faceHeight));
  } else if (mode === '1.4x') {
    baseScale = 1.4;
  } else if (mode === '1.8x') {
    baseScale = 1.8;
  }

  // Determine edge proximity in stage space
  const distToEdgeX = Math.min(bounds.minX, 1.0 - bounds.maxX);
  const distToEdgeY = Math.min(bounds.minY, 1.0 - bounds.maxY);

  // Auto-adapt zoom: if candidate moves toward sensor edge, reduce scale toward 1.0
  // to prevent cropping facial features when panning hits boundary clamp
  let scale = baseScale;
  if (mode === 'auto' || scale > 1.0) {
    const requiredMargin = 0.05; // 5% safe margin
    const faceWidth = bounds.maxX - bounds.minX;
    // Scale must not exceed what fits within viewport margins (0.90 available width/height)
    const maxScaleX = (1.0 - 2 * requiredMargin) / Math.max(0.1, faceWidth);
    const maxScaleY = (1.0 - 2 * requiredMargin) / Math.max(0.1, faceHeight);
    
    // Scale must also allow centering without exceeding physical sensor bounds
    // At boundary clamp, margin in viewport is: s * distToEdge >= requiredMargin
    const maxScaleEdge = Math.max(1.0, (1.0 - 2 * requiredMargin) / (1.0 - 2 * Math.min(distToEdgeX, distToEdgeY)));
    scale = Math.min(baseScale, maxScaleX, maxScaleY, maxScaleEdge);
    scale = Math.max(1.0, scale);
  }

  // Physical sensor bounds clamping: |pan| <= (scale - 1) / 2
  const maxPanX = (scale - 1.0) / 2.0;
  const maxPanY = (scale - 1.0) / 2.0;

  // Desired pan to center face at (targetViewportX, targetViewportY)
  const desiredPanX = targetViewportX - 0.5 - scale * (bounds.centerX - 0.5);
  const desiredPanY = targetViewportY - 0.5 - scale * (bounds.centerY - 0.5);

  const panX = Math.max(-maxPanX, Math.min(maxPanX, desiredPanX));
  const panY = Math.max(-maxPanY, Math.min(maxPanY, desiredPanY));

  // Compute resulting viewport bounds for all landmarks
  const uMin = 0.5 + scale * (bounds.minX - 0.5) + panX;
  const uMax = 0.5 + scale * (bounds.maxX - 0.5) + panX;
  const vMin = 0.5 + scale * (bounds.minY - 0.5) + panY;
  const vMax = 0.5 + scale * (bounds.maxY - 0.5) + panY;

  const hasSafeMargin = uMin >= 0.05 && uMax <= 0.95 && vMin >= 0.05 && vMax <= 0.95;
  const uCenter = (uMin + uMax) / 2;
  const vCenter = (vMin + vMax) / 2;
  const isCentered = hasSafeMargin && Math.abs(uCenter - 0.5) <= 0.15 && Math.abs(vCenter - 0.42) <= 0.18;

  return {
    ptz: {
      scale,
      panX: panX * 100, // percentage
      panY: panY * 100, // percentage
    },
    isCentered,
    hasSafeMargin,
  };
}
```

#### C. Smooth Animation and State Hysteresis Loop
- **Transform Application**:
  ```tsx
  <div
    className="coach-camera-stage"
    style={{
      transform: `translate3d(${interpolated.panX}%, ${interpolated.panY}%, 0) scale(${interpolated.scale})`,
      transformOrigin: '50% 50%',
    }}
  >
  ```
- **Animation Loop**:
  Run `requestAnimationFrame` continuously. Compute $\Delta t$ and smooth `panX`, `panY`, and `scale` with EMA factor $\alpha = 1 - e^{-\lambda \Delta t}$ ($\lambda = 7.0$).
- **Status State Machine**:
  Use hysteresis to avoid flapping:
  - Transition from `centered` to `off-center`: when `!isCentered` persists for $\ge 3$ consecutive frames.
  - Transition from `off-center` to `centered`: when `isCentered` with a stricter inner margin ($\ge 6\%$, $|uCenter - 0.5| \le 0.12$) persists for $\ge 3$ consecutive frames.
  - Transition to `no-face`: when no face is detected for $\ge 500\text{ms}$. During the 500ms grace window, hold previous transform and render canvas.

#### D. HUD Badges Accuracy
Verify actual landmark groups:
```typescript
const hasFace = Boolean(face && face.length >= 468);
const hasEyes = Boolean(hasFace && face[33] && face[263] && face[468]); // key eye & iris landmarks
const hasCheeks = Boolean(hasFace && LEFT_CHEEK_POINTS.every(i => face[i]) && RIGHT_CHEEK_POINTS.every(i => face[i]));

setFaceMetrics({
  faceDetected: hasFace,
  eyesDetected: hasEyes,
  cheeksDetected: hasCheeks,
  scale: interpolated.scale,
});
```

---

### 5.2 Verification Method

1. **Automated Playwright Tests** in `tests/browser/platform.spec.ts`:
   Add test cases simulating motion across directions:
   - **Center scenario**: Portrait at `(0, -80)` -> Expect status `Face tracked · centered in frame`, HUD badges active, scale $> 1.0$, all landmarks inside $[0.05, 0.95]$.
   - **Horizontal shift (Left)**: Portrait at `(-160, -80)` -> Expect auto-zoom reduction, status transition to `Face tracked · move toward the center`, no black margins ($|t_x| \le \frac{s - 1}{2}$), landmarks within $[0.05, 0.95]$.
   - **Horizontal shift (Right)**: Portrait at `(160, -80)` -> Expect auto-zoom reduction, status `Face tracked · move toward the center`, safe margin maintained.
   - **Vertical shift (Up/Down)**: Portrait at `(0, -180)` and `(0, 40)` -> Verify vertical bounds, eye-level tracking, and safe margin.
   - **No face transition**: Clear canvas -> Verify 500ms smooth decay to `Camera on · no face in frame` without visual snapping.
2. **Execution Commands**:
   - Playwright browser test:
     ```bash
     npx playwright test tests/browser/platform.spec.ts
     ```
   - Build verification:
     ```bash
     npm run build
     ```
   - College portal and auth safety regression tests:
     ```bash
     node --import tsx --test tests/collegePortal.test.ts tests/authSafety.test.ts
     ```
3. **Invalidation Conditions**:
   - Any landmark in face oval, eyes, or cheekbones has viewport coordinate $< 0.05$ or $> 0.95$ during movement.
   - Stage translation exceeds $(s - 1) / 2$, exposing black background borders.
   - Visual jumping occurs due to `transform-origin` changes.
   - Regression in existing login, college portal, or interview flow tests.
