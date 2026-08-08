"""
Local Speech-to-Text microservice for Interview Coach — Group Discussion.

Runs entirely on-box (no internet call), using faster-whisper on GPU.
Replaces the browser's webkitSpeechRecognition (which silently fails
whenever outbound access to Google's speech servers is blocked, e.g.
behind a DGX / JupyterHub proxy with restricted egress).

Usage:
    pip install -r requirements.txt
    python stt_server.py --port 8090 --model large-v3 --device cuda --compute-type float16

Then point the Node server at it:
    LOCAL_STT_URL=http://127.0.0.1:8090/transcribe

Endpoint:
    POST /transcribe
    multipart/form-data, field name "audio" containing a webm/wav/ogg clip
    -> { "text": "...", "language": "en", "duration": 2.7 }

    GET /health
    -> { "status": "ok", "model": "large-v3", "device": "cuda" }
"""

import argparse
import tempfile
import time

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

app = FastAPI(title="Interview Coach Local STT")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_model = None
_model_name = None
_device = None

# A short list of near-silence / filler transcripts Whisper sometimes
# hallucinates on empty audio. We drop these so silence doesn't get
# submitted as a discussion turn.
_JUNK_TRANSCRIPTS = {
    "", "you", "thank you", "thanks for watching", "bye", ".", "..", "...",
}


@app.on_event("startup")
def load_model():
    global _model, _model_name, _device
    from faster_whisper import WhisperModel

    args = app.state.args
    print(f"[STT] Loading faster-whisper model='{args.model}' device={args.device} "
          f"compute_type={args.compute_type} ...")
    _model = WhisperModel(args.model, device=args.device, compute_type=args.compute_type)
    _model_name = args.model
    _device = args.device
    print("[STT] Model loaded. Ready.")


@app.get("/health")
def health():
    return {"status": "ok", "model": _model_name, "device": _device}


@app.post("/transcribe")
async def transcribe(audio: UploadFile = File(...)):
    if _model is None:
        raise HTTPException(503, "Model still loading, try again shortly.")

    raw = await audio.read()
    if not raw or len(raw) < 500:
        # Too small to contain real speech (avoids wasting a GPU pass on silence)
        return {"text": "", "language": "en", "duration": 0}

    suffix = ".webm"
    if audio.filename and "." in audio.filename:
        suffix = "." + audio.filename.rsplit(".", 1)[-1]

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=True) as tmp:
        tmp.write(raw)
        tmp.flush()

        start = time.time()
        segments, info = _model.transcribe(
            tmp.name,
            language="en",
            vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=400),
            beam_size=1,
        )
        text = "".join(seg.text for seg in segments).strip()
        elapsed = time.time() - start

    if text.lower().strip(" .!?") in _JUNK_TRANSCRIPTS:
        text = ""

    return {
        "text": text,
        "language": getattr(info, "language", "en"),
        "duration": round(elapsed, 2),
    }


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--host", default="0.0.0.0")
    p.add_argument("--port", type=int, default=8090)
    p.add_argument("--model", default="large-v3",
                    help="tiny/base/small/medium/large-v3 or a local CTranslate2 model dir")
    p.add_argument("--device", default="cuda", choices=["cuda", "cpu"])
    p.add_argument("--compute-type", default="float16",
                    help="float16/int8_float16 on GPU, int8 on CPU")
    return p.parse_args()


if __name__ == "__main__":
    args = parse_args()
    app.state.args = args
    uvicorn.run(app, host=args.host, port=args.port)
