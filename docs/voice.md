# Voice and microphone implementation

Checked against current official provider documentation on 2026-10-14.

Groq Orpheus English supports the female profiles Hannah (`hannah`), Autumn (`autumn`), and Diana (`diana`). The speech endpoint accepts at most 200 characters and returns WAV. Conversational output is recommended without unnecessary vocal direction tags. The application uses sentence boundaries, preserves punctuation, and splits an overlong sentence at spaces; it rejects an unsplittable token instead of truncating it. [Official Orpheus documentation](https://console.groq.com/docs/text-to-speech/orpheus).

`canopylabs/orpheus-v1-english` is currently a preview model. `openai/gpt-oss-120b` is a production conversational option; `whisper-large-v3-turbo` is a production transcription option. These are three separate components. Account access still needs validation against the authenticated models endpoint. [Groq supported models](https://console.groq.com/docs/models).

Llama 3.3 70B Versatile and Llama 3.1 8B Instant stopped serving free/developer accounts on 2026-08-16; committed-spend enterprise accounts are exempt. Qwen 3.6 was replaced by Qwen 3.8 on 2026-09-14. Existing deployments should avoid these retired defaults. [Groq deprecations](https://console.groq.com/docs/deprecations).

## Playback behavior

- Groq credentials stay on the server. The browser requests `/api/voice/synthesize` with `{text, voice}`.
- `speakNaturalAI` cancels preceding speech synchronously; `enqueueNaturalAI` appends a deliberate announcement to a bounded queue.
- A selected profile and rate are captured for the whole utterance. One upcoming chunk is synthesized during current playback. HTML audio preserves pitch when playback speed changes.
- Cancellation aborts synthesis, stops audio, revokes object URLs, and settles every affected promise. Late provider responses cannot start an obsolete question.
- Network/429/502/504 failures have one bounded client retry. Invalid input, auth failure, and missing provider configuration remain explicit errors.
- Browser speech is a selectable device provider. Automatic switching is off by default and requires `allowBrowserFallback`; playback state always reports the actual provider. Device speech does not reproduce an Orpheus identity.
- Playback callbacks run once, at actual audio start and completed/failed termination. Cancellation settles its result without calling the obsolete completion handler, preserving legacy handlers that start listening. Results expose `completed`, `cancelled`, or `failed`, chunk count, and synthesis timings. Browser autoplay errors instruct the candidate to replay.

## Candidate microphone capture

`MicrophoneCapture` requests microphone access only when `.start()` is called. It accepts an optional device ID and abort signal, negotiates supported recording formats, and defaults to a three-minute / eight-megabyte recording budget. `.stop()` finalizes the complete recording; `.cancel()` releases tracks and discards it. Byte-limit failures discard an oversized capture rather than uploading a cut audio file.

Local energy VAD indicates sustained speech and silence with hysteresis. Silence updates the visible meter; it does not stop capture or submit an answer. VAD is a noisy-environment heuristic and is not a confidence, personality, honesty, or psychological measure. Candidates review transcribed words before submitting. Silent recordings are rejected before STT to reduce unsupported transcripts.

`transcribeRecordedSpeech` keeps the existing authenticated JSON contract: `{audio: base64, mimeType}` → `{text, source}`. Transcription has a 45-second client timeout and supports cancellation. No audio is persisted by the capture module. `listMicrophoneDevices` only enumerates browser-authorized devices; labels may be unavailable until permission is granted.

## Verification and voice comparison

Run the focused deterministic checks with `npx tsx --test tests/naturalVoice.test.mjs tests/speechCapture.test.mjs tests/speechChunks.test.mjs`. These use test providers/hardware substitutes and establish queue, cancellation, storage/request contracts, input bounds, and VAD behavior. They are not live Groq or human listening tests.

On 2026-10-14 all 20 focused checks passed. Seven isolated Chrome checks also exercised the actual HTML audio and MediaRecorder APIs using a synthetic WAV/microphone fixture: three queue entries completed with exactly three start/end callbacks; active/queued playback cancelled; a long pause left capture running and later speech resumed; stopping/cancelling and the duration limit ended microphone tracks; denied permission produced the expected error; no page exception was captured. [Recorded browser observations](voice-browser-verification.json) and [test screenshot](voice-native-browser.png) identify the fixtures explicitly. Synthetic timing values are not Groq latency measurements.

Reproduce these native checks with `node tests/voice.native.mjs` after installing Playwright Chromium, or use an existing Chrome executable: `VOICE_BROWSER_EXECUTABLE=/usr/bin/google-chrome node tests/voice.native.mjs`. The harness creates an isolated browser and loopback fixture server; it never requests a personal microphone, uses no auth session, and calls no speech provider. Temporary fixture files are removed when it finishes. Set `VOICE_BROWSER_EVIDENCE_DIR` to change the evidence output directory.

Run `npx tsx --env-file-if-exists=.env scripts/benchmark-voice.ts` after configuring `GROQ_API_KEY`. Optional variables are `VOICE_BENCHMARK_RUNS` (1–5), `VOICE_BENCHMARK_DIR`, and `GROQ_TTS_MODEL`. The script synthesizes the same three interview samples for all three profiles, saves WAV files and `benchmark.json`, and records actual synthesis latency and audio validity. It makes no requests when credentials are missing and records that blocker.

Listen to each saved sample at rate 1 and compare pronunciation, natural pauses, interviewer tone, audible artifacts, and identity consistency. Repeat at 0.85 and 1.15 for rate quality. Record a 1–5 rating with an audible example for every criterion, then choose a profile based on the recorded observations. Timing alone cannot determine which voice sounds best.

No local Groq credentials or authorized reference login were supplied. Actual Orpheus voice quality, STT accuracy on human speech, synthesis latency, and a complete spoken interview remain unverified until those live checks run.
