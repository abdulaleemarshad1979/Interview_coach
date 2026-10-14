import { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff } from 'lucide-react';
import { FaceLandmarker, FilesetResolver, type NormalizedLandmark } from '@mediapipe/tasks-vision';

type CameraStatus = 'off' | 'starting' | 'loading' | 'no-face' | 'centered' | 'off-center' | 'unavailable';

const labels: Record<CameraStatus, string> = {
  off: 'Camera is off',
  starting: 'Opening your camera…',
  loading: 'Loading face tracking…',
  'no-face': 'Camera on · no face in frame',
  centered: 'Face tracked · centered in frame',
  'off-center': 'Face tracked · move toward the center',
  unavailable: 'Camera on · face tracking unavailable',
};

function drawFace(canvas: HTMLCanvasElement, points: NormalizedLandmark[], width: number, height: number) {
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  const context = canvas.getContext('2d');
  if (!context) return;
  context.clearRect(0, 0, width, height);
  context.strokeStyle = '#6ee7b7';
  context.lineWidth = Math.max(2, width / 320);
  context.beginPath();
  for (const connection of FaceLandmarker.FACE_LANDMARKS_FACE_OVAL) {
    const from = points[connection.start];
    const to = points[connection.end];
    if (!from || !to) continue;
    context.moveTo(from.x * width, from.y * height);
    context.lineTo(to.x * width, to.y * height);
  }
  context.stroke();
}

export default function CameraObserver() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackerRef = useRef<FaceLandmarker | null>(null);
  const frameRef = useRef<number>(0);
  const generationRef = useRef(0);
  const [status, setStatus] = useState<CameraStatus>('off');
  const [error, setError] = useState('');

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
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
      if (generation !== generationRef.current) { stream.getTracks().forEach(track => track.stop()); return; }
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) { stop(); return; }
      video.srcObject = stream;
      await video.play();
      if (generation !== generationRef.current) return;
    } catch (failure) {
      setError((failure as Error).name === 'NotAllowedError' ? 'Camera permission was denied. Allow this site to use your camera, then try again.' : 'Could not open your camera. Check that another app is not using it.');
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
        runningMode: 'VIDEO', numFaces: 1,
        minFaceDetectionConfidence: 0.5, minFacePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
      });
      if (generation !== generationRef.current) { tracker.close(); return; }
      trackerRef.current = tracker;
      let lastVideoTime = -1;
      let lastDetection = 0;
      const tick = (timestamp: number) => {
        if (generation !== generationRef.current) return;
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (video && canvas && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && document.visibilityState === 'visible' && timestamp - lastDetection >= 200 && video.currentTime !== lastVideoTime) {
          lastVideoTime = video.currentTime;
          lastDetection = timestamp;
          try {
            const face = tracker.detectForVideo(video, timestamp).faceLandmarks[0];
            if (face?.length) {
              drawFace(canvas, face, video.videoWidth, video.videoHeight);
              const left = Math.min(...face.map(point => point.x));
              const right = Math.max(...face.map(point => point.x));
              setStatus((left + right) / 2 >= 0.35 && (left + right) / 2 <= 0.65 ? 'centered' : 'off-center');
            } else {
              canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
              setStatus('no-face');
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

  return <section className="coach-panel coach-camera" aria-label="Camera and face tracking">
    <div className="coach-camera-heading"><div><p className="coach-eyebrow">Camera observer</p><h2>See yourself during the interview</h2></div>
      <button className="coach-button" type="button" onClick={status === 'off' ? () => void start() : stop} disabled={status === 'starting'}>
        {status === 'off' ? <Camera size={17} /> : <CameraOff size={17} />}{status === 'off' ? 'Start camera' : 'Turn camera off'}
      </button>
    </div>
    <div className="coach-camera-preview">
      <video ref={videoRef} autoPlay muted playsInline aria-label="Your live camera preview" />
      <canvas ref={canvasRef} aria-hidden="true" />
      {status === 'off' && <div className="coach-camera-placeholder"><CameraOff size={28} /><span>Camera off</span></div>}
    </div>
    <p role="status" className="coach-muted">{labels[status]}</p>
    {error && <p role="alert" className="coach-error">{error}</p>}
    <p className="coach-muted">Face landmarks are processed on this device for framing guidance. Video and face data are not uploaded or used to score answers.</p>
  </section>;
}
