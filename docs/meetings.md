# Group discussions and meeting operations

## Existing failure and replacement boundary

The previous `GroupDiscussionPage.tsx` used an application WebSocket plus browser peer-to-peer mesh connections. Its reconnect handler opened a fresh socket without sending `join_room` again. Each server WebSocket handler held its own `currentRoomCode` and `participantId`, so the replacement socket had no room context. Signaling and subsequent discussion messages consequently failed after a reconnect.

Other code-level defects were:

- All `/api/gd-room/*` routes and the `/ws/gd-room` upgrade accepted requests without the application session middleware. A participant ID visible in the room snapshot acted as authorization, including host operations.
- HTTP polling performed a complete read, mutation, and upsert of the room document. Concurrent participants could overwrite one another’s joins, signals, acknowledgements, and dialogue turns.
- Database failures silently fell back to a process-local map. Separate serverless instances could see different room state.
- The default media configuration offered public STUN servers but no TURN relay. A WebSocket connection or room entry did not demonstrate actual media connectivity.
- Remote media was attached to both an audio element and an unmuted video element, which could play the same audio twice.
- Screen-share and hand-raise state variables had no functional publishing flow. Speaker highlights followed submitted transcript turns rather than media activity.
- The legacy evaluation fallback invented qualitative feedback and word-count-based scores when the analysis provider failed.

The new frontend uses `MeetingLobby` and `LiveMeeting`. The application authenticates all `/api/meetings` requests and persists room authorization in MongoDB. LiveKit carries audio/video between real connected participants. The old API routes are retired by the server integration; legacy documents remain intact.

## Media and authorization

```text
Signed-in user → authenticated application API → persisted membership/admission
                                             → room-specific LiveKit token
Browser camera/microphone ↔ LiveKit SFU ↔ other admitted participants
```

Tokens use an identity derived from the verified application user ID, bind one room, expire after five minutes, and grant only camera, microphone, screen video/audio publication and subscription. Browser-supplied identities and host flags are ignored. Tokens contain no room administration or general room-creation grant; chat and hand raise use authenticated application endpoints. A waiting or denied participant cannot request a media token. Token issuance rechecks admission and room status after the SFU call.

LiveKit clients provide SDK reconnection, track publication, subscription, device switching, and media speaker activity. The grid displays participants from the SDK’s actual connected room. The sidebar distinguishes persisted admission from a current media connection. [LiveKit connection documentation](https://docs.livekit.io/intro/basics/connect/).

Participant removal uses an explicit revocation cutoff when supported. **Self-hosted LiveKit does not revoke an already issued token on participant removal.** A removed participant with a cached valid token could reconnect to the SFU until it expires, including outside this UI. The application refuses subsequent token requests, and tokens have a five-minute TTL. LiveKit Cloud’s token revocation support is needed for stronger immediate enforcement; confirm the deployed version’s behavior before a production acceptance claim. Ending a room removes connected participants and deletes the SFU room before marking it ended in MongoDB. [LiveKit token lifecycle](https://docs.livekit.io/home/server/generating-tokens/).

One application account has one stable participant identity in a room. Joining the same account from another browser can disconnect its previous media connection; use four distinct signed-in accounts when testing four participants.

## Configuration

Configure only on the application server:

```dotenv
LIVEKIT_URL=wss://your-approved-livekit-endpoint
LIVEKIT_API_KEY=your-server-api-key
LIVEKIT_API_SECRET=your-server-api-secret
GROQ_API_KEY=your-server-groq-key
GROQ_STT_MODEL=whisper-large-v3-turbo
GROQ_MODEL_REPORT=openai/gpt-oss-120b
```

The credentials above are placeholders. Never put the API key or secret in a `VITE_*` variable or a committed environment file. This implementation consumes an existing LiveKit deployment; it does not purchase an account or provision infrastructure. `/api/meetings/status` reports whether the server has sufficient meeting configuration, without returning secret values. The lobby disables creating/joining live meetings when that service is unconfigured while retaining access to history.

Production requires an HTTPS application origin and a trusted TLS certificate for the `wss://` SFU endpoint. For restrictive networks, configure LiveKit’s TURN service and its separate TLS domain/certificate. [LiveKit deployment documentation](https://docs.livekit.io/transport/self-hosting/deployment/).

For a self-hosted deployment, the published defaults include UDP media ports 50000–60000, TCP media port 7881, an optional single UDP mux port 7882, TURN/TLS 5349, and TURN/UDP 3478. The API/WebSocket port 7880 should sit behind TLS termination. Use the actual selected deployment configuration when setting firewall rules; opening only the application HTTP port cannot establish multi-network media. [LiveKit ports and firewall reference](https://docs.livekit.io/transport/self-hosting/ports-firewall/).

Development permits `ws://localhost` or `ws://127.0.0.1` when `NODE_ENV` is not production. The isolated browser harness can use a local development SFU and public development credentials without touching a user database. A local test does not prove TURN/NAT behavior across independent networks.

## API contract

All paths below are under `/api/meetings` and require the existing application bearer session. Errors use `{ "error": "safe message", "code": "MACHINE_CODE" }`. Secrets, complete upstream errors, and transcripts are not logged by these routes. Status and room responses carry `Cache-Control: no-store`.

| Route | Input or behavior | Authorization |
| --- | --- | --- |
| `GET /status` | Configuration status, consent notice version, token lifetime | Signed in |
| `GET /?page=1` | Membership-scoped room history; 20 rooms per page | Own memberships |
| `POST /` | `title`, `topic`, `displayName`, optional `passcode`, `waitingRoom`, `observerMode`, `retentionDays`, `transcriptConsent`, optional rubric weights | Creator becomes host |
| `POST /:code/join` | `displayName`, optional `passcode`, `transcriptConsent` | Signed in; configured passcode verified |
| `GET /:code` | Room, own membership/report, permitted participant/transcript/chat snapshot | Existing, non-denied member |
| `POST /:code/token` | No caller identity or role is accepted | Admitted member of an open room |
| `POST /:code/admission` | `identity`, `admit` | Room host |
| `POST /:code/consent` | `granted` | Own consent only |
| `POST /:code/chat` | `text` | Admitted member of an open room |
| `POST /:code/hand` | `raised` | Admitted member of an open room |
| `POST /:code/audio` | Base64 audio, allowed `mimeType`, own `trackSid`, stable `clientSegmentId`, `startedAt`, `endedAt`, `speakingSeconds` | Admitted, consenting microphone owner |
| `PATCH /:code/transcripts/:id` | Corrected `text` | Own completed segment only |
| `POST /:code/moderation` | `INTRODUCE`, `TIME_REMINDER`, or `BALANCE` action | Host; active mode enabled |
| `POST /:code/end` | End the SFU room, then persist ended state | Host |
| `POST /:code/reports` | Generate outstanding participant reports after transcription finishes | Host of ended room |
| `POST /:code/leave` | Mark own membership left | Own membership |
| `DELETE /:code/data` | Remove own transcripts/chat/report and withdraw own consent | Own membership |
| `DELETE /:code/data?scope=all` | Remove all room transcripts/chat/reports and withdraw consent | Host |
| `DELETE /:code` | End room if necessary and delete room, membership, transcript, event and consent records | Host |

Default waiting-room admission is enabled. Passcodes are optional, stored as salted scrypt hashes, and never returned. Invites contain a random twelve-character hexadecimal meeting ID, with the passcode shared separately. Meeting capacity at the SFU is twenty; validate larger rooms separately before increasing it.

Mongo collections are additive (`MeetingRoomV2`, `MeetingMemberV2`, `MeetingTranscriptV2`, `MeetingEventV2`, `MeetingConsentV2`). Compound unique membership indexes prevent full-room overwrites. There is no in-memory persistence fallback. Data expires after the host’s selected 1-, 7-, or 30-day retention period. Access checks enforce expiry before Mongo’s asynchronous TTL cleanup runs.

Client audio retries reuse the original segment ID and audio hash. Completed transcripts replay safely; failed transcription can be retried, and reuse with different audio is rejected. MongoDB atomically claims one report generation run per room. A bounded lease recovers interrupted runs, and already saved participant reports do not repeat provider calls.

## Consented speech and evidence

```text
Own published microphone track → local VAD + complete audio segments
                              → authenticated audio upload
                              → SFU track ownership check
                              → server Groq STT → speaker-associated transcript
                              → validated per-participant report
```

The observer never captures mixed room output or another participant’s remote tracks. The server ignores speaker names and IDs in audio requests, derives the speaker from verified membership, and checks the microphone track SID against that identity’s actual SFU publication. Audio chunks are limited to 1 MB, fifteen seconds, supported browser media types, and a recent timestamp. The browser sends independently decodable audio files, uses voice/silence detection, bounds its upload queue, and retries transient failures with the same segment ID. It reports skipped or failed segments rather than inventing text.

This is **authenticated browser capture**, not an independently trusted server audio collector. Track ownership proves which publication belongs to the authenticated participant; it cannot cryptographically prove that a browser-supplied audio file came from that track or that every physical voice near the microphone belongs to that user. Attribution is explicitly marked `AUTHENTICATED_LOCAL_TRACK`; speaking duration and participation balance are approximate client-observed voice activity. Overlap does not merge speaker tracks, but transcript accuracy and background speech still need human-speech validation. The application does not claim to detect interruptions, personality, honesty, or psychological traits.

Consent is optional for attending the meeting and required on the server before speech processing. A visible notice identifies an active observer. Withdrawing consent immediately stops local capture, aborts queued uploads, and records revocation on the server. An in-flight provider response rechecks consent and data revisions before saving. Own-data or whole-room deletion increments revisions and cannot be undone by a late transcription or report response. Minimal membership and consent audit records remain until retention expiry or host room deletion.

Report criteria are argument quality, topic understanding, communication clarity, and collaboration, each scored 0–5 with host-configurable weights totaling 100%. Every scored criterion must include an exact excerpt and segment ID from that participant. Altered, fabricated, or differently attributed excerpts reject the provider response. Missing evidence yields `null` scores and an explicit insufficient-evidence report. Chat alone does not count as spoken evidence. Analysis uses bounded transcript context and identifies omitted earlier/longer contributions. Corrections invalidate an existing report so it can be regenerated.

Active moderation posts brief text only when the host explicitly asks for an introduction, elapsed-time reminder, or invitation to contribute. It does not inject an artificial participant or interrupt the group with automatic speech.

## Legacy faculty assignment migration

Existing `GDRoom` documents and historical `ProctorAssignment` entries are retained. Their participant IDs were not backed by verified application accounts, so they cannot safely become new authenticated memberships or consent records automatically.

For an active faculty assignment:

1. The authenticated host opens the new discussion lobby and creates a room with the existing topic.
2. The host shares the new invitation and passcode, and updates the assignment’s `room_code` through the normal authorized assignment workflow if that workflow supports it.
3. Students join using their own application accounts and supply fresh consent before transcription.
4. Keep the old assignment/report as historical data. Do not import its fabricated fallback scores into new evidence-based reports.

The lobby explicitly identifies an old-format assigned room code and asks the participant to obtain a new invitation. Legacy assignment creation code that still depends on `/api/gd-room/*` must use the new room flow; it cannot continue creating unauthenticated rooms.

## Verification and remaining gates

Run `node --import tsx --test tests/meetings.test.ts` for isolated MongoDB authorization, waiting/passcode, token grant, concurrent membership, consent, ownership, correction, report evidence, deletion, provider failure, and retention tests. AI and SFU adapters in this suite are synthetic fixtures; passing them is not real speech, Groq, or WebRTC evidence.

The root browser harness owns the local four-client SFU check. Record its actual result and artifacts in `docs/verification-report.md`. To satisfy production acceptance, additionally verify four real people speaking, Groq transcripts and individual reports against their words, camera/audio behavior across separate networks, TURN fallback, mobile devices, screen share, and reconnect under a real network interruption. These are not implied by a build or mocked contract test. A final incomplete speech segment can be lost when a participant abruptly leaves, revokes consent, loses the network, or is disconnected by room termination; the host flushes its own capture before ending.
