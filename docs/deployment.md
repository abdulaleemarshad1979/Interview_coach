# Deployment

## Required services

Reuse MongoDB and a Node 22.22+ Express deployment. Configure Groq and an existing LiveKit SFU independently; do not provision or bill infrastructure without operator authorization. LiveKit Cloud or a properly configured self-hosted SFU must expose trusted HTTPS/WSS signaling and reachable media/TURN ports. Configure public DNS, certificates, NAT advertisement and firewalls using [LiveKit deployment guidance](https://docs.livekit.io/home/self-hosting/deployment/) and [ports](https://docs.livekit.io/home/self-hosting/ports-and-firewall/).

Production `LIVEKIT_URL` must use `wss://`. LiveKit API credentials stay server-side; only five-minute room-specific participant tokens reach the browser. Self-hosted removal does not revoke an already-issued token immediately; enforce admission on issuance, remove participants, end the SFU room, and account for the short remaining token lifetime. Host ending must reach LiveKit successfully; an SFU outage is surfaced as a retryable failure.

## Release procedure

1. Back up MongoDB using the existing operator process. Record the current Git revision and deployment configuration.
2. Set environment secrets (`MONGODB_URI`, `GROQ_API_KEY`, LiveKit credentials), model overrides, `APP_URL`, staff allowlists, explicit origins and proxy hop count. Do not build credentials into frontend variables.
3. Run `npm ci`, `npm run lint`, `npm test`, `npm run build`, and appropriate browser/live-provider checks.
4. Run `npm run db:migrate -- --dry-run`; review the additive collections/indexes, then `npm run db:migrate`. It never drops old records. Password scheme updates occur only after successful authentication.
5. Confirm college portal sign-in is the only active login path. Existing staff sessions retain their current expiry, but staff password sign-in is retired.
6. Deploy the reviewed branch through the existing platform. In Docker, the app binds `0.0.0.0:3000`, runs as the non-root node user and uses Node 22. Run `docker build` locally before a release. The app health endpoint is liveness, not proof of working AI or media.
7. Verify login, resume analysis, a complete spoken interview and evidence report, waiting/admission/passcode authorization, four consenting participants from separate networks, STT attribution, report generation, deletion, and network interruption recovery.

## Vercel

Vercel runs the bundled Express entrypoint in `api/index.cjs` and serves the frontend from `dist/client`. Importing raw `server.ts` in a Vercel Function fails at runtime on extensionless backend imports. The SFU uses LiveKit's independent signaling/media service rather than Vercel WebSocket upgrades. Validate function timeouts, SSE streaming and response limits for the selected plan; increase function duration only within plan limits. Long transcription/evaluation requests can exceed platform budgets and must surface retryable errors without invented scores. MongoDB must permit the platform's network access.

## Retention and rollback

Meeting collections have TTL indexes, and API access checks room expiration immediately because TTL cleanup is asynchronous. Existing legacy records remain untouched; establish a separate approved retention policy for old collections. User-owned interviews remain until deletion. Audio chunks are not retained as recordings.

Rollback uses the recorded starting Git revision/deployment without destructive database changes. New collections remain available for a later roll-forward; do not drop them as a rollback shortcut. Rolling back restores insecure old APIs, so do not expose a legacy build without appropriate access restrictions. Restoring previously fabricated reports does not make those reports evidence-based.

## Production check on 14 October 2026

The updated frontend and API were deployed to [Interview Coach](https://interview-coach-nu-coral.vercel.app/). The main production URL is public; Vercel Authentication still protects previews and generated deployment URLs. Unauthenticated `/api/health` returned 200. Production logs recorded a successful MongoDB connection; malformed college input returned `INVALID_PORTAL_INPUT` 400, and a synthetic invalid ACET account returned `INVALID_PORTAL_CREDENTIALS` 401 after reaching the college verifier. The same synthetic AUS request returned `PORTAL_VERIFICATION_REQUIRED` 503 because the official portal requires browser verification. The retired account endpoints returned 410. A credentialed production college login was not attempted; it requires an authorized ECAP account.
