"""
Local Text-to-Speech microservice for Interview Coach.

Uses Piper (fast, GPU/CPU-friendly, low-latency neural TTS — good fit for
a group discussion where several participants may trigger TTS close
together and you need short, predictable latency rather than the most
expressive voice). Runs entirely on-box, no internet call, no API key.

Setup:
    pip install -r requirements.txt
    # download a voice, e.g. a natural US English female voice:
    mkdir -p voices && cd voices
    curl -LO https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/amy/medium/en_US-amy-medium.onnx
    curl -LO https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/amy/medium/en_US-amy-medium.onnx.json
    cd ..
    python tts_server.py --port 8091 --voice voices/en_US-amy-medium.onnx

Endpoint:
    POST /speak   { "text": "..." }
    -> audio/wav bytes

    GET /health
    -> { "status": "ok", "voice": "en_US-amy-medium" }
"""

import argparse
import io
import wave

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel
import uvicorn

app = FastAPI(title="Interview Coach Local TTS")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_voice = None
_voice_name = None


class SpeakRequest(BaseModel):
    text: str
    speed: float = 1.0


@app.on_event("startup")
def load_voice():
    global _voice, _voice_name
    from piper import PiperVoice

    args = app.state.args
    print(f"[TTS] Loading Piper voice from {args.voice} ...")
    _voice = PiperVoice.load(args.voice, config_path=args.config, use_cuda=args.cuda)
    _voice_name = args.voice
    print("[TTS] Voice loaded. Ready.")


@app.get("/health")
def health():
    return {"status": "ok", "voice": _voice_name}


@app.post("/speak")
def speak(req: SpeakRequest):
    if _voice is None:
        raise HTTPException(503, "Voice still loading, try again shortly.")

    text = (req.text or "").strip()
    if not text:
        raise HTTPException(400, "text is required")
    if len(text) > 2000:
        text = text[:2000]

    buf = io.BytesIO()
    with wave.open(buf, "wb") as wav_file:
        _voice.synthesize(text, wav_file, length_scale=1.0 / max(req.speed, 0.1))

    return Response(content=buf.getvalue(), media_type="audio/wav")


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--host", default="0.0.0.0")
    p.add_argument("--port", type=int, default=8091)
    p.add_argument("--voice", required=True, help="path to a Piper .onnx voice model")
    p.add_argument("--config", default=None, help="path to the voice's .onnx.json (defaults to <voice>.json)")
    p.add_argument("--cuda", action="store_true", help="run Piper's onnxruntime session on GPU")
    return p.parse_args()


if __name__ == "__main__":
    args = parse_args()
    if args.config is None:
        args.config = args.voice + ".json"
    app.state.args = args
    uvicorn.run(app, host=args.host, port=args.port)
