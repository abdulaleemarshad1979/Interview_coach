# Local Speech-to-Speech for Group Discussion (DGX B200 / On-Prem GPU)

This replaces cloud speech APIs that fail when outbound internet access is restricted or proxied:

| Cloud Fallback                       | Local GPU Solution (DGX / On-Prem)   |
|---------------------------------------|----------------------------------------|
| `webkitSpeechRecognition` → Google STT | `stt_server.py` → faster-whisper on GPU |
| Gemini Audio TTS / Google Cloud TTS    | `tts_server.py` → Piper on GPU/CPU     |
| Ollama LLM / Groq (unchanged)         | local Ollama `qwen3.5:122b` or similar |

## 1. Install

```bash
cd local-voice
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Verify GPU CUDA acceleration:
nvidia-smi
```

## 2. Download TTS Voice

```bash
mkdir -p voices && cd voices
curl -LO https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/amy/medium/en_US-amy-medium.onnx
curl -LO https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/amy/medium/en_US-amy-medium.onnx.json
cd ..
```

## 3. Run Microservices

```bash
# STT microservice (port 8090)
python stt_server.py --port 8090 --model large-v3 --device cuda --compute-type float16

# TTS microservice (port 8091)
python tts_server.py --port 8091 --voice voices/en_US-amy-medium.onnx
```

## 4. Configure Application Environment

Add the following to your `.env` file:

```env
LOCAL_STT_URL=http://127.0.0.1:8090/transcribe
LOCAL_TTS_URL=http://127.0.0.1:8091/speak
```

The Node Express server (`server.ts`) will proxy `/api/local-stt/transcribe` and `/api/local-tts/speak` requests seamlessly to these microservices without requiring any API keys or outbound internet access.
