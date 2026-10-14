import { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, Sparkles, ZoomIn, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import { FaceLandmarker, FilesetResolver, type NormalizedLandmark } from '@mediapipe/tasks-vision';

type CameraStatus = 'off' | 'starting' | 'loading' | 'no-face' | 'centered' | 'off-center' | 'unavailable';
type ZoomMode = 'auto' | '1x' | '1.4x' | '1.8x';

interface CameraObserverProps {
  compact?: boolean;
  title?: string;
  subtitle?: string;
}

const labels: Record<CameraStatus, string> = {
  off: 'Camera is off',
  starting: 'Opening your camera…',
  loading: 'Loading face tracking…',
  'no-face': 'Camera on · no face in frame',
  centered: 'Face tracked · centered in frame',
  'off-center': 'Face tracked · move toward the center',
  unavailable: 'Camera on · face tracking unavailable',
};

// Key cheekbone connections and prominent feature points from 468/478 face landmarks
const LEFT_CHEEKBONE_CONNECTIONS: Array<[number, number]> = [
  [116, 123], [123, 147], [147, 187], [187, 205], [205, 50], [50, 101],
];
const RIGHT_CHEEKBONE_CONNECTIONS: Array<[number, number]> = [
  [345, 352], [352, 376], [376, 411], [411, 425], [425, 280], [280, 330],
];
const LEFT_CHEEK_POINTS = [116, 123, 187, 50, 205];
const RIGHT_CHEEK_POINTS = [345, 352, 411, 280, 425];

function drawFace(
  canvas: HTMLCanvasElement,
  points: NormalizedLandmark[],
  width: number,
  height: number,
  showLandmarks: boolean = true,
) {
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const context = canvas.getContext('2d');
  if (!context) return;
  context.clearRect(0, 0, width, height);
  if (!showLandmarks) return;

  const baseLineWidth = Math.max(1.8, width / 320);

  // 1. Draw Face Oval (Face contour) - Emerald
  context.strokeStyle = '#34d399';
  context.lineWidth = baseLineWidth;
  context.beginPath();
  for (const connection of FaceLandmarker.FACE_LANDMARKS_FACE_OVAL) {
    const from = points[connection.start];
    const to = points[connection.end];
    if (!from || !to) continue;
    context.moveTo(from.x * width, from.y * height);
    context.lineTo(to.x * width, to.y * height);
  }
  context.stroke();

  // 2. Draw Eyes - Sky Blue
  context.strokeStyle = '#38bdf8';
  context.lineWidth = baseLineWidth * 0.95;
  context.beginPath();
  for (const connection of [...FaceLandmarker.FACE_LANDMARKS_LEFT_EYE, ...FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE]) {
    const from = points[connection.start];
    const to = points[connection.end];
    if (!from || !to) continue;
    context.moveTo(from.x * width, from.y * height);
    context.lineTo(to.x * width, to.y * height);
  }
  context.stroke();

  // 3. Draw Eyebrows - Indigo/Blue accent
  context.strokeStyle = '#818cf8';
  context.lineWidth = baseLineWidth * 0.85;
  context.beginPath();
  for (const connection of [...FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW, ...FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW]) {
    const from = points[connection.start];
    const to = points[connection.end];
    if (!from || !to) continue;
    context.moveTo(from.x * width, from.y * height);
    context.lineTo(to.x * width, to.y * height);
  }
  context.stroke();

  // 4. Draw Irises / Pupils - Cyan glowing dots
  if (FaceLandmarker.FACE_LANDMARKS_LEFT_IRIS && FaceLandmarker.FACE_LANDMARKS_RIGHT_IRIS) {
    context.fillStyle = '#67e8f9';
    for (const connection of [...FaceLandmarker.FACE_LANDMARKS_LEFT_IRIS, ...FaceLandmarker.FACE_LANDMARKS_RIGHT_IRIS]) {
      const pt = points[connection.start];
      if (!pt) continue;
      context.beginPath();
      context.arc(pt.x * width, pt.y * height, Math.max(1.5, baseLineWidth * 0.8), 0, 2 * Math.PI);
      context.fill();
    }
  }

  // 5. Draw Cheekbones (Zygomatic arches & prominences) - Purple / Violet
  context.strokeStyle = 'rgba(192, 132, 252, 0.9)';
  context.lineWidth = baseLineWidth;
  context.beginPath();
  for (const [start, end] of [...LEFT_CHEEKBONE_CONNECTIONS, ...RIGHT_CHEEKBONE_CONNECTIONS]) {
    const from = points[start];
    const to = points[end];
    if (!from || !to) continue;
    context.moveTo(from.x * width, from.y * height);
    context.lineTo(to.x * width, to.y * height);
  }
  context.stroke();

  // Highlight key cheekbone prominence anchor points
  context.fillStyle = '#e879f9';
  for (const idx of [...LEFT_CHEEK_POINTS, ...RIGHT_CHEEK_POINTS]) {
    const pt = points[idx];
    if (!pt) continue;
    context.beginPath();
    context.arc(pt.x * width, pt.y * height, Math.max(2, baseLineWidth * 0.9), 0, 2 * Math.PI);
    context.fill();
  }

  // 6. Draw Lips (Subtle Rose/Pink)
  context.strokeStyle = 'rgba(244, 114, 182, 0.65)';
  context.lineWidth = baseLineWidth * 0.75;
  context.beginPath();
  for (const connection of FaceLandmarker.FACE_LANDMARKS_LIPS) {
    const from = points[connection.start];
    const to = points[connection.end];
    if (!from || !to) continue;
    context.moveTo(from.x * width, from.y * height);
    context.lineTo(to.x * width, to.y * height);
  }
  context.stroke();
}

export default function CameraObserver({ compact = false, title, subtitle }: CameraObserverProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackerRef = useRef<FaceLandmarker | null>(null);
  const frameRef = useRef<number>(0);
  const generationRef = useRef(0);
  const [status, setStatus] = useState<CameraStatus>('off');
  const [error, setError] = useState('');

  // Zoom & UI state
  const [zoomMode, setZoomMode] = useState<ZoomMode>('auto');
  const zoomModeRef = useRef<ZoomMode>('auto');
  zoomModeRef.current = zoomMode;

  const [showMesh, setShowMesh] = useState(true);
  const showMeshRef = useRef(true);
  showMeshRef.current = showMesh;

  const [transform, setTransform] = useState({ scale: 1.0, originX: 50, originY: 50, shiftY: 0 });
  const [faceMetrics, setFaceMetrics] = useState({
    faceDetected: false,
    eyesDetected: false,
    cheeksDetected: false,
    scale: 1.0,
  });

  const stop = () => {
    generationRef.current++;
    cancelAnimationFrame(frameRef.current);
    trackerRef.current?.close();
    trackerRef.current = null;
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    const canvas = canvasRef.current;
    canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    setStatus('off');
    setTransform({ scale: 1.0, originX: 50, originY: 50, shiftY: 0 });
    setFaceMetrics({ faceDetected: false, eyesDetected: false, cheeksDetected: false, scale: 1.0 });
  };

  useEffect(() => () => {
    generationRef.current++;
    cancelAnimationFrame(frameRef.current);
    trackerRef.current?.close();
    streamRef.current?.getTracks().forEach(track => track.stop());
  }, []);

  const start = async () => {
    if (status !== 'off') return;
    const generation = ++generationRef.current;
    setError('');
    setStatus('starting');
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Camera access requires HTTPS and a supported browser.');
      setStatus('off');
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      if (generation !== generationRef.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) { stop(); return; }
      video.srcObject = stream;
      await video.play();
      if (generation !== generationRef.current) return;
    } catch (failure) {
      setError((failure as Error).name === 'NotAllowedError'
        ? 'Camera permission was denied. Allow this site to use your camera, then try again.'
        : 'Could not open your camera. Check that another app is not using it.');
      stop();
      return;
    }

    setStatus('loading');
    try {
      const assets = new URL('/vision/wasm', window.location.origin).href;
      const model = new URL('/vision/face_landmarker.task', window.location.origin).href;
      const fileset = await FilesetResolver.forVisionTasks(assets);
      const tracker = await FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: model, delegate: 'CPU' },
        runningMode: 'VIDEO',
        numFaces: 1,
        minFaceDetectionConfidence: 0.5,
        minFacePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      if (generation !== generationRef.current) { tracker.close(); return; }
      trackerRef.current = tracker;
      let lastVideoTime = -1;
      let lastDetection = 0;

      const tick = (timestamp: number) => {
        if (generation !== generationRef.current) return;
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (
          video &&
          canvas &&
          video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
          document.visibilityState === 'visible' &&
          timestamp - lastDetection >= 200 &&
          video.currentTime !== lastVideoTime
        ) {
          lastVideoTime = video.currentTime;
          lastDetection = timestamp;
          try {
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

              // Auto-framing & zoom calculation ("take importance area from zoom")
              const mode = zoomModeRef.current;
              let targetScale = 1.0;
              if (mode === 'auto') {
                targetScale = Math.min(2.1, Math.max(1.0, 0.52 / faceH));
              } else if (mode === '1.4x') {
                targetScale = 1.4;
              } else if (mode === '1.8x') {
                targetScale = 1.8;
              }

              // Mirrored horizontal center (scaleX(-1)): visual x = 1 - midX
              const visualCenterX = 1 - midX;
              const visualCenterY = midY;
              const originX = Math.round(Math.max(15, Math.min(85, visualCenterX * 100)));
              const originY = Math.round(Math.max(20, Math.min(80, visualCenterY * 100)));
              const shiftY = targetScale > 1.0 ? Math.round(Math.max(-25, Math.min(25, (0.42 - visualCenterY) * 100 * (1 - 1 / targetScale)))) : 0;

              setTransform({ scale: targetScale, originX, originY, shiftY });
              setFaceMetrics({
                faceDetected: true,
                eyesDetected: true,
                cheeksDetected: true,
                scale: targetScale,
              });
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
          } catch {
            tracker.close();
            trackerRef.current = null;
            setStatus('unavailable');
            return;
          }
        }
        frameRef.current = requestAnimationFrame(tick);
      };
      frameRef.current = requestAnimationFrame(tick);
    } catch {
      if (generation === generationRef.current) setStatus('unavailable');
    }
  };

  const handleZoomChange = (mode: ZoomMode) => {
    setZoomMode(mode);
    if (status === 'off' || status === 'no-face') return;
    let targetScale = 1.0;
    if (mode === '1.4x') targetScale = 1.4;
    else if (mode === '1.8x') targetScale = 1.8;
    else if (mode === 'auto') targetScale = faceMetrics.scale > 1.0 ? faceMetrics.scale : 1.5;
    setTransform(prev => ({ ...prev, scale: targetScale }));
  };

  return (
    <section className={`coach-panel coach-camera ${compact ? 'coach-camera-compact' : ''}`} aria-label="Camera and face tracking">
      <div className="coach-camera-heading">
        <div>
          <p className="coach-eyebrow">{compact ? 'Camera preview' : 'Camera observer'}</p>
          <h2>{title || (compact ? 'Check camera & framing' : 'See yourself during the interview')}</h2>
          {subtitle && <p className="coach-camera-sub">{subtitle}</p>}
        </div>
        <button
          className="coach-button"
          type="button"
          onClick={status === 'off' ? () => void start() : stop}
          disabled={status === 'starting'}
        >
          {status === 'off' ? <Camera size={17} /> : <CameraOff size={17} />}
          {status === 'off' ? 'Start camera' : 'Turn camera off'}
        </button>
      </div>

      <div className="coach-camera-preview">
        {/* Scaled & panned stage for face zoom / auto-framing */}
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

        {status === 'off' && (
          <div className="coach-camera-placeholder">
            <CameraOff size={28} />
            <span>Camera off</span>
          </div>
        )}

        {/* Live HUD Badges for Face, Eyes, Cheekbones, and Zoom status */}
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
            {transform.scale > 1.01 && (
              <span className="coach-hud-zoom">
                {transform.scale.toFixed(1)}x {zoomMode === 'auto' ? 'Auto Zoom' : 'Zoom'}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Camera Controls & Auto-Zoom Toolbar */}
      {status !== 'off' && (
        <div className="coach-camera-toolbar">
          <div className="coach-zoom-controls" aria-label="Camera zoom and framing">
            <span className="coach-toolbar-label">
              <ZoomIn size={13} /> Framing:
            </span>
            <div className="coach-zoom-group" role="radiogroup" aria-label="Framing zoom level">
              <button
                type="button"
                className={`coach-zoom-btn ${zoomMode === 'auto' ? 'active' : ''}`}
                onClick={() => handleZoomChange('auto')}
                title="Automatically zoom and center on face, eyes, and cheekbones"
              >
                <Sparkles size={11} className="inline mr-1" />
                Auto
              </button>
              <button
                type="button"
                className={`coach-zoom-btn ${zoomMode === '1x' ? 'active' : ''}`}
                onClick={() => handleZoomChange('1x')}
                title="Wide camera view (1x)"
              >
                1x
              </button>
              <button
                type="button"
                className={`coach-zoom-btn ${zoomMode === '1.4x' ? 'active' : ''}`}
                onClick={() => handleZoomChange('1.4x')}
                title="Medium portrait zoom (1.4x)"
              >
                1.4x
              </button>
              <button
                type="button"
                className={`coach-zoom-btn ${zoomMode === '1.8x' ? 'active' : ''}`}
                onClick={() => handleZoomChange('1.8x')}
                title="Close-up focus on face and eyes (1.8x)"
              >
                1.8x
              </button>
            </div>
          </div>

          <button
            type="button"
            className={`coach-mesh-toggle ${showMesh ? 'active' : ''}`}
            onClick={() => setShowMesh(!showMesh)}
            title={showMesh ? 'Hide landmark mesh overlay' : 'Show landmark mesh overlay'}
          >
            {showMesh ? <Eye size={13} /> : <EyeOff size={13} />}
            <span>{showMesh ? 'Mesh on' : 'Mesh off'}</span>
          </button>
        </div>
      )}

      <p role="status" className="coach-muted">{labels[status]}</p>
      {error && <p role="alert" className="coach-error">{error}</p>}
      <p className="coach-muted">
        Face contour, eyes, and cheekbones are processed on this device for framing guidance. Video and face landmarks are not uploaded or used to score answers.
      </p>
    </section>
  );
}
