# Architecture audit and execution plan — 2026-10-14

## Baseline and rollback

The clean checkout began on `feat/groq-voice-reliability-20261013` at `945fc1b2212e1acebaa32fb6e4415a7f061f26c4`. Origin is the requested `https://github.com/abdulaleemarshad1979/Interview_coach.git`. Work continues on `codex/interview-meeting-platform`; the starting commit is the rollback reference. Existing history and user data are retained through additive collections and a versioned password upgrade on successful login. No secrets or database records will be committed.

Before code changes, `npm run lint` and `npm run build` passed. Frontend bundle: 605.88 kB / 167.41 kB gzip with a chunk-size warning. `node --experimental-strip-types --test tests/speechChunks.test.mjs` failed because this Node 22 binary lacks native TypeScript support; `node --import tsx --test tests/speechChunks.test.mjs` passed three tests. No test script or CI workflow existed.

## Skills and tools

Read the actual installed reverse-engineer-anything, browser-testing-with-devtools, debugging-and-error-recovery, code-review, git-workflow, and frontend-ui-engineering instructions. REA and Chrome DevTools MCP tools are not connected. Public reference observation uses available CUA and isolated browser automation; source inspection establishes repository behavior. No login bypass, credential retrieval, private endpoint extraction or proprietary code copying is needed. Separate observations from unverified authenticated features in reference-analysis.md. Specialized GPT-6.1 agents with max reasoning handle reference/voice, backend interview and SFU meetings. Shared contracts are agreed before editing shared files.

## Existing architecture

- React 19, Vite 6, Tailwind 4, TypeScript; view navigation in App.tsx and institutional blue/orange light theme. Landing/auth/dashboard/profile/resume analysis/faculty/admin features exist.
- Express monolith server.ts, Groq SDK plus Ollama and OpenAI-compatible completions. Groq TTS/STT endpoints exist; interviews still use browser Web Speech capture.
- MongoDB/Mongoose users, seven-day opaque bearer sessions, profiles, proctor assignments and legacy group rooms. supabaseClient.ts is an API compatibility shim. Interview history lives in user metadata/localStorage without authoritative session orchestration.
- Browser WebRTC mesh with WebSocket SDP/ICE relay and HTTP polling fallback. Public STUN lacks guaranteed TURN. Docker/Kubernetes/Vercel configuration exists; ordinary Vercel serverless functions cannot host WebSocket upgrades or an SFU.

## Defects established by source and baseline

1. Legacy group HTTP/WebSocket endpoints lack authentication. Client participant IDs permit host impersonation. Reopened sockets do not resend join_room, leaving server-side membership empty. Full-room read/write updates lose concurrent changes; DB-error memory fallback diverges across replicas.
2. Remote audio renders through both audio and unmuted video. Mesh uploads grow with participant count. Four-client and cross-network media behavior has not been verified.
3. Interviews advance a fixed question list. Backend report error paths fabricate scores. Initial acoustic/camera UI values cannot substantiate evaluations.
4. Speech playback/cancellation races and silent provider changes can duplicate speech or change voice identity.
5. Password PBKDF2 uses 1,000 synchronous iterations. Public signup and metadata updates accept is_admin/is_faculty. Profile writes accept arbitrary IDs. Existing privileged accounts need audit.
6. AI lacks consistent streaming, usage, cancellation, deadlines and concurrency bounds. Some error/log output exposes internal details.
7. Dockerfile has an invalid optional COPY shell expression, uses Node 20 despite dependency requirements, and binds localhost inside containers.

## Dependency-aware plan

1. Establish baseline, branch, official provider/SFU references and shared contracts before code edits. Research public reference independently.
2. Add authenticated MongoDB interview sessions with valid transitions, bounded memory, idempotent turns, streaming, evidence reports, history/resume/deletion. Add reusable provider deadlines/retries/cancellation/concurrency/usage.
3. In parallel add authenticated SFU room service and LiveKit UI: waiting/passcode/admission, host controls, media/chat/hand/screen/reconnect, consented speaker-associated STT, reports and retention. Preserve legacy records and retire unsafe entry points.
4. Add explicit voice providers, serial cancellable playback and complete-answer microphone capture with VAD/device/permission handling. Integrate adaptive UI; retain existing profile/resume/faculty workflows where compatible.
5. Harden shared auth/profile APIs, origins/rate limits/errors. Add versioned password migration, additive indexes/migration and repaired container configuration.
6. Run unit, isolated persistence/API and browser tests; review standards/spec separately. Actual provider tests need credentials; actual media tests need an SFU and consenting clients. Record skips explicitly.
7. Update README/environment/deployment/troubleshooting/verification docs. Commit using existing owner identity, push feature branch to origin, inspect resulting deployment without provisioning paid resources or altering production.

## Constraints

At audit time GROQ_API_KEY, MONGODB_URI, LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET were absent and no .env existed. User authorized local configuration if present. Real listening, production database, four-client SFU and separate-network tests remain blocked until configured. Isolated fixtures test contracts/persistence, not real provider/media quality. Acceptance gates require supporting evidence.
