# Interview Coach — Architecture audit (2026-10-13)

## Repository inspected
`abdulaleemarshad1979/Interview_coach`, default branch `main` (read-only connector access).

**Existing stack:** React 19 + Vite + TypeScript frontend; Express/Node server in a single large `server.ts`; MongoDB via Mongoose for users, session tokens, room state and proctor assignments. `src/lib/supabaseClient.ts` is a local MongoDB-auth adapter, not an active Supabase auth client. API provider service already uses `groq-sdk`, with Ollama and OpenAI-compatible alternatives. The deployment contains Docker, Kubernetes and Vercel configurations.

## Evidence-backed defects and limitations

1. `src/lib/naturalVoice.ts`: voice preference order previously tried local Piper, then client-side Gemini calls, then browser speech. The browser could fall back to unsuitable voices; calls were not sentence-limited for Groq Orpheus; no Groq TTS existed. Client-side `VITE_GEMINI_API_KEY` usage exposed the key to browser clients if provisioned.
2. `server.ts`: default Groq conversational model `llama-3.3-70b-versatile` was retired on 2026-08-16 for non-enterprise users. Override `GROQ_MODEL` if set to a retired identifier.
3. `src/components/InterviewPage.tsx`: when no answer was recorded, a plausible answer was invented and submitted. On API errors, a fake per-question score **84** or full scorecard **86** was presented. Such records cannot be treated as assessment evidence.
4. `src/components/GroupDiscussionPage.tsx`: browser-to-browser WebRTC mesh with public STUN and optional TURN credentials; `server.ts` relays SDP/ICE via WebSocket and persistent HTTP polling. This is not an SFU and may fail across restricted NATs. WebSocket upgrades are not viable on ordinary serverless Vercel functions; HTTP polling is a compatibility fallback, not equivalent media transport.
5. Group room endpoints rely on room and participant IDs passed by clients, not centrally verified membership/session identity. A secure production room/participant permission model is still required.
6. Interview speech recognition relies on the browser's Web Speech API, which varies by browser; it is not yet routed to Groq STT in this patch.
7. No test script was defined in the current `package.json` when inspected.
8. Password hashing uses PBKDF2 with only 1,000 iterations; a versioned migration to a modern password hash (Argon2id or equivalent) is advisable rather than an unreviewed in-place change.

## Scope of the local patch

- Backend authenticated Groq TTS and STT endpoints; API keys remain on server.
- Groq-first, local-Piper-second, browser-last voice playback with per-request cancellation and sentence-aware chunks.
- Female voice profile selection (Hannah, Autumn, Diana) and local playback-rate choice.
- Group discussion speech chunks sent to authenticated Groq STT (or existing local service if Groq is absent), with opt-in checkbox in the join flow.
- Remove invented interview answers and fabricated scorecards on errors.
- Update default Groq model to a non-retired model and add `.env.example` values.

**Not implemented:** SFU, cross-network four-user validation, trusted server-side room/consent enforcement, adaptive AI interviewer state machine, or full test infrastructure.

## Delivery limitation

The connected GitHub identity reported push permission but the feature-branch creation endpoint returned HTTP 403 `Resource not accessible by integration`. Thus this work is delivered as a patch installer, not as a GitHub commit or deploy.
