# Interview Coach

Interview preparation and group discussions built on the existing React/Express/MongoDB application. Adaptive interviews use actual server-side AI output, retain answer-grounded memory, and save reports with verifiable transcript excerpts. Multi-user discussions use a LiveKit SFU with authenticated admission, consented microphone transcription, and individual evidence-based feedback.

## Run locally

Use Node 22.22+ and MongoDB. Copy `.env.example` to `.env` and configure `MONGODB_URI` and `GROQ_API_KEY` on the server. For meetings, also configure `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` from an existing LiveKit deployment. No provider secret uses a `VITE_` prefix.

```bash
npm ci
npm run db:migrate -- --dry-run
npm run db:migrate
npm run dev
```

Open http://localhost:3000. Select **Get Started → Sign in with an Interview Coach account** to register or sign in with an app account. The existing college portal sign-in remains available. First-time college roll registration requires successful portal verification; staff accounts must be provisioned by the operator.

Production build/start:

```bash
npm run build
NODE_ENV=production npm start
```

## Interviews

Choose technical, HR, behavioral, resume, project, system design, coding, or mixed practice. Supply role, experience, domain, difficulty, duration, and optional resume/job context. The interviewer asks one question at a time and validates follow-up grounding against the candidate's actual words. Coding mode accepts code and reasoning as text; there is no code execution sandbox.

Record a complete answer or type it. Review the transcription before submitting. Silence detection does not cut off or submit an answer. Choose a microphone after granting permission. Playback is serial, cancellable, and sentence-aware, with an explicit provider choice. Groq Orpheus profiles are Hannah, Autumn and Diana. Browser speech is device-dependent and must be explicitly selected or permitted as a fallback.

History supports resuming, report retrieval and authorized deletion. Interrupted answers are saved and retried without duplicate transcript entries. Session time does not restart on resume. Scores are calculated only from validated dimensions with actual transcript excerpts; unsupported observations remain unscored. No personality, honesty, psychological, gaze or camera-based assessment is inferred.

## Discussions

Create a topic, optional passcode, waiting room, AI mode and retention period. Share the invitation link or meeting ID. Participants sign in and the host admits them before room tokens are issued. A LiveKit client exchanges camera/microphone/screen tracks through the SFU, independently of the app server's HTTP hosting. Cameras and microphones start off.

The room includes a participant grid, active speaker indicators, mute/camera/screen controls, chat, raised hands, device selection, reconnection, host removal/end controls, live transcript corrections and reports. Passive observation stays silent. Active mode offers explicitly host-requested topic introductions, time reminders and discussion prompts.

AI capture records only the consenting client's local microphone track and verifies its authenticated LiveKit identity/track SID on the server. Audio chunks are processed in memory; this app does not store audio/video recordings. Admitted users see room transcripts. Each participant and the host can retrieve that participant's report. Consent withdrawal prevents late in-flight transcripts from being saved. Self/host deletion invalidates retained reports; room retention is 1, 7 or 30 days. Browser-provided audio and timing cannot be independently authenticated as server-captured media; reports disclose that limitation.

## AI and voice configuration

Current defaults are `openai/gpt-oss-120b` for Groq conversation, `whisper-large-v3-turbo` for recognition, and `canopylabs/orpheus-v1-english` with `hannah` for speech. Availability is account-dependent; verify [Groq models](https://console.groq.com/docs/models), [deprecations](https://console.groq.com/docs/deprecations), and [Orpheus TTS](https://console.groq.com/docs/text-to-speech).

The provider layer also supports configured Ollama and OpenAI-compatible JSON completions. Provider timeouts, cancellation, bounded concurrency, structured validation, retry and usage accounting are server-side. Provisional streamed output is never spoken or persisted as a validated question until the complete response passes validation.

`npm run benchmark:voice` compares the same questions across three Orpheus voices when a real key is present. It saves WAV files and synthesis timings for an operator listening evaluation; without a key it records an explicit blocked result. Generation success alone does not prove naturalness or audible quality.

## Staff access and security

Set `ADMIN_EMAILS` / `FACULTY_EMAILS` to the authorized addresses. Public registration cannot claim an allowlisted address or grant privileges. Existing staff accounts retain their password and require both an allowlist entry and operator provisioning. To create a new account, set `STAFF_EMAIL`, `STAFF_NAME`, `STAFF_INITIAL_PASSWORD` in the local/server environment and run `npm run staff:provision`; remove the initial password afterward.

Session expiration is checked on every protected request. Existing PBKDF2 passwords upgrade to asynchronous scrypt after a valid login, without a forced reset. Profile writes enforce owner identity. Production rate-limit counters use MongoDB for shared enforcement across instances. Configure `APP_URL`, optional `ALLOWED_ORIGINS` and the exact `TRUST_PROXY_HOPS` count for your reverse proxy. Never broadly trust arbitrary proxy headers.

Resume uploads are bounded PDFs with content validation. Arbitrary server-side resume URL fetching is disabled. Resume and transcript content are untrusted input to AI prompts. Secrets and complete private transcripts are not logged by the new services. Review legacy stored roles, academic records and reports before treating them as verified evidence.

## Validation

```bash
npm run lint
npm test
npm run test:browser
npm run test:providers
npm audit
```

Unit/API tests use explicit synthetic AI fixtures where noted and real isolated MongoDB. Browser tests use an isolated database and the compiled frontend; they never connect to production data. Live Groq tests are skipped unless credentials are configured; STT also requires an operator-provided audio fixture. Test skips and fixture results are not real AI quality verification.

For actual local SFU transport tests, run the following development-only service, then enable the four-client test:

```bash
docker run --rm -d --name interview-coach-test-sfu --network host \
  livekit/livekit-server:v1.13.9 --dev --bind 127.0.0.1 --node-ip 127.0.0.1
TEST_LOCAL_SFU=true npm run test:browser
docker stop interview-coach-test-sfu
```

This uses public LiveKit development credentials in the isolated test harness, four browser contexts and generated camera/microphone streams. It does not prove separate-network connectivity, real spoken transcription, or listening quality. Never use development SFU credentials for production.

## Deployment and migration

See [deployment](docs/deployment.md), [troubleshooting](docs/troubleshooting.md), [interview API](docs/interview-api.md), [meeting architecture](docs/meetings.md), [voice pipeline](docs/voice.md), and [verification report](docs/verification-report.md).

The migration creates additive collections/indexes and records a migration version without dropping old data or indexes. Legacy room and fabricated-assessment API paths return `410`; old records remain in MongoDB and old report history remains readable. Faculty assignments using six-character legacy room IDs must be recreated as secure rooms and invitations shared again.

The original repository and history are retained. This implementation is not production-accepted until the credentialed spoken-interview and separate-network discussion gates in the verification report pass.
