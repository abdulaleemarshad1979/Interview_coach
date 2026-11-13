# Camera Auto-Framing & Virtual PTZ Architecture Investigation Report

**Agent**: explorer_survey_1  
**Directory**: `/home/abdul-aleem-arshad-mohammed/Work/Interview_coach/.agents/teamwork/explorer_survey_1`  
**Date**: 2026-10-14T17:42:00Z  
**Scope**: Camera auto-framing, MediaPipe face/landmark tracking, transform math, jitter/cropping root causes, and virtual PTZ architecture design.

---

## 1. Observation

### 1.1 Architecture & Governing Files
The camera feed, facial landmark detection, canvas rendering, auto-framing math, and CSS transformations are governed by the following modules:

1. **`src/components/CameraObserver.tsx`** (466 lines):
   - **Imports & Types (lines 1-7)**:
     - MediaPipe vision library: `import { FaceLandmarker, FilesetResolver, type NormalizedLandmark } from '@mediapipe/tasks-vision';` (line 3).
     - State types: `CameraStatus = 'off' | 'starting' | 'loading' | 'no-face' | 'centered' | 'off-center' | 'unavailable';` (line 5).
     - Zoom mode: `ZoomMode = 'auto' | '1x' | '1.4x' | '1.8x';` (line 6).
   - **Cheekbone & Facial Landmark Definitions (lines 24-33)**:
     - MediaPipe 468/478-point landmark topology indices for zygomatic arch and cheekbone prominences:
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
   - **Landmark Mesh Canvas Rendering (`drawFace`, lines 34-138)**:
     - 1. Face Oval (contour): `FaceLandmarker.FACE_LANDMARKS_FACE_OVAL` in emerald `#34d399` (lines 52-64).
     - 2. Eyes: `FaceLandmarker.FACE_LANDMARKS_LEFT_EYE` & `RIGHT_EYE` in sky blue `#38bdf8` (lines 65-76).
     - 3. Eyebrows: `FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW` & `RIGHT_EYEBROW` in indigo `#818cf8` (lines 78-89).
     - 4. Irises / Pupils: `FaceLandmarker.FACE_LANDMARKS_LEFT_IRIS` & `RIGHT_IRIS` (points 468-477) in cyan `#67e8f9` (lines 91-101).
     - 5. Cheekbones: Zygomatic arches in violet `rgba(192, 132, 252, 0.9)` and prominence anchors in fuchsia `#e879f9` (lines 103-124).
     - 6. Lips: `FaceLandmarker.FACE_LANDMARKS_LIPS` in rose `rgba(244, 114, 182, 0.65)` (lines 126-137).
   - **DOM Structure & Video/Canvas Hierarchy (lines 352-400)**:
     ```tsx
     <div className="coach-camera-preview">
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
       {/* HUD Badges and Toolbar */}
     </div>
     ```
   - **Current Auto-Framing Math (lines 256-296)**:
     ```typescript
     const face = tracker.detectForVideo(video, timestamp).faceLandmarks[0];
     if (face?.length) {
       drawFace(canvas, face, video.videoWidth, video.videoHeight, showMeshRef.current);
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

       const mode = zoomModeRef.current;
       let targetScale = 1.0;
       if (mode === 'auto') {
         targetScale = Math.min(2.1, Math.max(1.0, 0.52 / faceH));
       } else if (mode === '1.4x') {
         targetScale = 1.4;
       } else if (mode === '1.8x') {
         targetScale = 1.8;
       }

       const visualCenterX = 1 - midX;
       const visualCenterY = midY;
       const originX = Math.round(Math.max(15, Math.min(85, visualCenterX * 100)));
       const originY = Math.round(Math.max(20, Math.min(80, visualCenterY * 100)));
       const shiftY = targetScale > 1.0 ? Math.round(Math.max(-25, Math.min(25, (0.42 - visualCenterY) * 100 * (1 - 1 / targetScale)))) : 0;

       setTransform({ scale: targetScale, originX, originY, shiftY });
       ...
     ```

2. **`src/index.css`** (lines 40-44):
   ```css
   .coach-camera-preview { position: relative; width: min(100%, 560px); aspect-ratio: 16 / 9; overflow: hidden; border-radius: .65rem; background: #0f172a; }
   .coach-camera-stage { position: absolute; inset: 0; width: 100%; height: 100%; }
   .coach-camera-preview video, .coach-camera-preview canvas { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; transform: scaleX(-1); }
   .coach-camera-preview canvas { pointer-events: none; }
   ```

3. **Consumers & Callers**:
   - `src/components/AdaptiveInterviewPage.tsx` (line 174): `<CameraObserver />` in main live interview session.
   - `src/components/MeetingLobby.tsx` (line 116): `<CameraObserver compact title="Camera & framing check" subtitle="Test face, eyes, and cheekbone tracking before your discussion" />` in discussion waiting lobby.

4. **Vision Model & Assets**:
   - `scripts/copy-vision-assets.mjs`: Copies WASM engine from `@mediapipe/tasks-vision/wasm` into `public/vision/wasm`.
   - `public/vision/face_landmarker.task`: 3.75 MB MediaPipe Face Landmarker model asset.

5. **Existing Verification Suite**:
   - `npm test`: Node test runner executing unit and integration tests across 81 tests (76 passing, 0 failing, 5 skipped live provider tests).
   - `tests/browser/platform.spec.ts` (lines 42-61): Playwright test verifying face detection using synthetic mock `navigator.mediaDevices.getUserMedia` fed with `assets/abdul_profile.png`.

---

## 2. Logic Chain

### 2.1 Why `transformOrigin` Causes Jitter and Visual Wobble
1. **Mathematical non-commutativity of dynamic transform-origin shifts**:
   In CSS transforms, `transform-origin: (O_x, O_y)` defines the invariant center point for dilation:
   $$P'(P) = O + S \cdot (P - O) = S \cdot P + (1 - S) \cdot O$$
   When the face moves, the detected landmark coordinates shift by $\Delta O$. Even when scale $S$ is constant (e.g. $S = 1.8$):
   $$\Delta P' = (1 - S) \cdot \Delta O = -0.8 \cdot \Delta O$$
   Any micro-noise in landmark detection (such as 1% detector variance $\approx 5.6$ px) causes the entire video element to jump by $4.5$ px in the opposite direction.
2. **Desynchronized Dual CSS Transitions**:
   Line 359 declares:
   `transition: 'transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), transform-origin 0.35s ease-out'`
   `transform` (scale, translateY) and `transform-origin` (originX, originY) are animated independently using two different timing curves (`cubic-bezier` vs `ease-out`). At intermediate timestamps $t \in (0, 0.35s)$, the transformation matrix follows a non-linear composite trajectory where the dilation center travels along one curve while scale expands along another. This generates visible visual wobble and erratic rotational-like shearing.
3. **5 Hz Update Rate vs 350 ms Duration**:
   Detection is throttled to `timestamp - lastDetection >= 200` (line 250), dispatching state updates every 200 ms.
   Because the CSS transition lasts 350 ms, every incoming detection frame interrupts the ongoing transition when it is only $200 / 350 \approx 57\%$ complete. Re-starting CSS transitions mid-flight resets velocity tangents, creating persistent visual stutter.
4. **Integer Quantization Steps**:
   Lines 286-288 use `Math.round(... * 100)`, producing coarse 1% discrete steps (5.6 px horizontal / 3.15 px vertical on a 560x315 stage), preventing smooth sub-pixel continuous motion.

### 2.2 Why `transformOrigin` and Compound Transforms Cause Black Borders / Margins
1. **Unbounded Stage Boundaries**:
   The container `.coach-camera-preview` has `aspect-ratio: 16 / 9`, `overflow: hidden`, and background `#0f172a`.
   To avoid exposing the background `#0f172a`, the transformed bounding box of `.coach-camera-stage` $[x'_{min}, x'_{max}] \times [y'_{min}, y'_{max}]$ must satisfy:
   $$x'_{min} \le 0 \quad \text{and} \quad x'_{max} \ge 1$$
   $$y'_{min} \le 0 \quad \text{and} \quad y'_{max} \ge 1$$
2. **Vertical Offset Leakage**:
   In `CameraObserver.tsx`, line 357 combines `scale(${scale}) translateY(${shiftY}%)` with `transformOrigin: originX% originY%`:
   $$y'_{min} = o_y + S \cdot (shiftY - o_y) = (1 - S) \cdot o_y + S \cdot shiftY$$
   When an upright candidate has $visualCenterY = 0.20$ ($o_y = 0.20$) and target scale $S = 1.4$:
   $$shiftY = (0.42 - 0.20) \times (1 - 1/1.4) = +0.22 \times 0.2857 = +6.28\%$$
   $$y'_{min} = (1 - 1.4) \times 0.20 + 1.4 \times (+0.0628) = -0.080 + 0.088 = +0.008 > 0$$
   Because $y'_{min} > 0$, the top edge of the camera stage pulls down below the container's top boundary by $0.8\%$, exposing a black horizontal bar. During dynamic transitions where scale starts from $1.0$, this gap expands to over $5\%$ of viewport height, producing black flickering borders.

### 2.3 Why Facial Landmarks and Cheekbones Get Cropped During Movement
1. **Aspect Ratio Crop Blindness**:
   - Container `.coach-camera-preview` is $16:9 \approx 1.778$.
   - Web camera stream is requested as $640 \times 480$, which is $4:3 \approx 1.333$.
   - The CSS declaration `.coach-camera-preview video { object-fit: cover; }` expands the video height to fill the width, causing $12.5\%$ of the video to be cropped at the top and $12.5\%$ at the bottom before any auto-framing transform is applied:
     $$y_{visible} \in [0.125, 0.875]$$
   - `CameraObserver.tsx` treats raw MediaPipe $y \in [0, 1]$ as if $0.0$ were visible, when in reality $y = 0.125$ is already the top edge of the screen. A face with forehead at $y = 0.15$ is only $2.5\%$ from the top edge, causing immediate forehead and temple clipping upon any zoom.
2. **Ignoring Sensor Bounds in Zoom Calculation**:
   - Line 276 calculates scale solely from height: `targetScale = Math.min(2.1, Math.max(1.0, 0.52 / faceH))`.
   - It assumes the face is in the center of the sensor.
   - When a candidate moves towards the left or right edges ($midX \to 0.1$ or $0.9$), the camera stage pans to follow them.
   - However, the video sensor has a physical boundary ($x = 0$ and $x = 1$). Once pan hits the boundary, the stage cannot translate further without showing black borders.
   - Because the current code keeps scale fixed at high zoom ($S = 1.8$ or $2.1$) and clamps `originX` to $[15, 85]$, the lateral cheekbone prominences (indices 116, 187, 345, 411) and eyes collide with the edge of the viewport and get cropped off.

---

## 3. Virtual PTZ & Smoothing Formulation

### 3.1 Pure Virtual PTZ Formulation
1. **Fixed Center Origin**:
   Permanently fix `transformOrigin: '50% 50%'` on `.coach-camera-stage`. Never animate or shift `transform-origin`.
2. **Affine Translation + Scale**:
   Apply transformations in standard PTZ order:
   ```css
   transform: translate3d(panX%, panY%, 0) scale(scale);
   transform-origin: 50% 50%;
   ```
3. **Strict Geometric Non-Black-Margin Boundary Envelope**:
   For any scale $S \ge 1.0$, when scaled about 50% 50%, the maximum allowable translation before any stage edge pulls away from the container edge is:
   $$|panX| \le 50 \times (S - 1)$$
   $$|panY| \le 50 \times (S - 1)$$
   This guarantees that $x'_{min} \le 0$, $x'_{max} \ge 1$, $y'_{min} \le 0$, and $y'_{max} \ge 1$ under all circumstances.

### 3.2 Dynamic Scale Adaptation for Edge Movement (Preserving Face, Eyes, & Cheekbones)
Let $[X_{vis,min}, X_{vis,max}] \times [Y_{vis,min}, Y_{vis,max}]$ be the normalized visual bounding box of all facial landmarks (oval contour, left/right eyes, irises, and cheekbones), converted to account for the mirrored feed ($X_{vis} = 1 - x$) and aspect ratio cover crop.
Let safe margin $M \ge 0.05$ (5% margin from all viewport edges).

When a candidate moves towards an edge and panning reaches the boundary limit $\pm 50(S - 1)$, the scale $S$ must dynamically adapt so that all landmarks remain inside $[M, 1 - M]$:
$$S_{max,left} = \frac{1 - M}{X_{vis,max}}$$
$$S_{max,right} = \frac{1 - M}{1 - X_{vis,min}}$$
$$S_{max,top} = \frac{1 - M}{1 - Y_{vis,min}}$$
$$S_{max,bottom} = \frac{1 - M}{Y_{vis,max}}$$

The safe adapted scale is:
$$S_{adapted} = \max\left(1.0, \; \min\left(S_{target}, \; S_{max,left}, \; S_{max,right}, \; S_{max,top}, \; S_{max,bottom}\right)\right)$$
If a candidate moves towards the edge, zoom smoothly pulls back, guaranteeing that the face oval, eyes, and cheekbones remain visible with $\ge 5\%$ margin!

### 3.3 Temporal Smoothing & Jitter Elimination
To eliminate detector micro-noise:
1. **Deadband Filter**:
   If candidate displacement $|\Delta X| < 0.012$ (1.2% frame width) and $|\Delta Y| < 0.012$, freeze target pan coordinates to ignore sensor noise when candidate is still.
2. **Exponential Moving Average (EMA / LERP)**:
   Smooth target coordinates across detection updates:
   $$S_{smooth} = S_{prev} + \alpha_S \cdot (S_{target} - S_{prev}) \quad (\alpha_S \approx 0.3)$$
   $$panX_{smooth} = panX_{prev} + \alpha_P \cdot (panX_{target} - panX_{prev}) \quad (\alpha_P \approx 0.3)$$
   $$panY_{smooth} = panY_{prev} + \alpha_P \cdot (panY_{target} - panY_{prev}) \quad (\alpha_P \approx 0.3)$$
3. **Unified Single-Property CSS Transition**:
   ```css
   transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1);
   ```
   No competing `transform-origin` transition. Completely eliminates stutter and shearing.

---

## 4. Caveats
1. **Model Delegate & Frame Throttling**: MediaPipe runs with `delegate: 'CPU'`. Throttling to $\ge 150\text{--}200$ ms is essential to maintain low CPU footprint during real interview conversations. The temporal filter bridge ensures that 5 Hz detection produces fluid 60 fps CSS rendering.
2. **Authentication & Session Preservation**: As mandated by R3, `CameraObserver.tsx` operates entirely on the client DOM; no changes touch `backend/collegePortal.ts`, auth routes, or database schemas.
3. **No Direct Code Implementation**: Per Teamwork Explorer protocol, this report provides architectural investigation and mathematical specifications; source implementation will be performed by the designated implementer.

---

## 5. Conclusion
The root causes of jitter, black borders, and facial landmark cropping in Interview Coach camera auto-framing have been conclusively identified and mathematically modeled:
1. **Jitter** is caused by dynamic `transform-origin` shifts desynchronized with `transform` transitions at 5 Hz, quantized by integer rounding.
2. **Black borders** are caused by compound `translateY` and off-center origin scaling that violate the $[0, 1]$ viewport envelope.
3. **Landmark cropping** is caused by uncompensated 4:3-to-16:9 `object-fit: cover` vertical cropping, combined with height-only zoom scaling that fails to adapt when panning reaches physical camera sensor boundaries.

Replacing this with **Virtual PTZ (fixed 50% 50% origin, pure clamped translation + scale, aspect-ratio-corrected bounding box, dynamic edge-zoom adaptation, and exponential smoothing deadband)** will eliminate jitter, eradicate black borders, and keep face, eyes, irises, and cheekbones continuously visible within safe $\ge 5\%$ margins across all horizontal, vertical, and distance movement.

---

## 6. Recommended Implementation Strategy & Verification Method

### 6.1 Proposed Refactoring in `src/components/CameraObserver.tsx`
1. **Aspect Ratio Correction Helper**:
   Calculate normalized container coordinates from camera stream coordinates taking into account container aspect ratio ($16/9$) vs video aspect ratio ($videoWidth / videoHeight$).
2. **Bounding Box & Safe Scale Computation**:
   Compute $[X_{vis,min}, X_{vis,max}]$ and $[Y_{vis,min}, Y_{vis,max}]$ over all landmarks.
   Compute $panX = S \cdot (0.5 - visualCenterX) \times 100$, clamped to $\pm 50(S - 1)$.
   Compute $panY = S \cdot (targetCenterY - visualCenterY) \times 100$, clamped to $\pm 50(S - 1)$.
   Adapt $S$ downwards when approaching edges using the closed-form boundary formulas.
3. **Filter State in Ref**:
   Maintain smoothed `(scale, panX, panY)` in a React ref with a 1.2% deadband and EMA interpolation factor $\alpha = 0.3$.
4. **Stage Style**:
   ```tsx
   style={{
     transform: `translate3d(${transform.panX}%, ${transform.panY}%, 0) scale(${transform.scale})`,
     transformOrigin: '50% 50%',
     transition: 'transform 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
   }}
   ```

### 6.2 Independent Verification Method
1. **Unit & Integration Regression Guardrail**:
   Execute:
   ```bash
   npm test
   ```
   Must pass all 81 tests cleanly with 0 failures.
2. **Playwright Camera & Movement Scenario Suite**:
   Execute:
   ```bash
   npx playwright test tests/browser/platform.spec.ts
   ```
   Add test cases simulating:
   - Left candidate movement (`paint(-140, -80)`): verify scale adapts and landmarks have margin $\ge 5\%$.
   - Right candidate movement (`paint(140, -80)`): verify margin $\ge 5\%$ and status reports off-center.
   - Up and Down candidate movement (`paint(0, -150)` and `paint(0, 0)`): verify face oval and eyes remain visible without black stage borders.
   - Confirm stage bounding rect never exposes `#0f172a` container background:
     `stageRect.left <= previewRect.left && stageRect.right >= previewRect.right && stageRect.top <= previewRect.top && stageRect.bottom >= previewRect.bottom`.
