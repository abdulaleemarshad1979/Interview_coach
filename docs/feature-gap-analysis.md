# Feature gap: Interview Coach vs public iQua vs target

| Capability | Interview Coach before patch | Public iQua evidence | Patch result | Remaining |
| --- | --- | --- | --- | --- |
| AI interview questions | Generated using provider abstraction | Advertises skill/role-based AI interviews | Existing flow preserved; Groq default updated | Stateful answer-grounded follow-up engine |
| Female AI voice | Piper/Gemini/browser fallback | Voice quality not inspectable | Authenticated Groq Orpheus, 3 female options, chunking, cancellation | Listening evaluation, interruption benchmarks |
| Transcription | Browser Web Speech + local GD STT | Not inspectable | GD chunk STT sent to Groq or local backend | Interview STT integration, overlapping speakers |
| Interview scoring | Server evaluation and fabricated UI errors | Advertises performance metrics | Fake answer and fallback UI scores removed | Validate backend report prompts and evidence |
| Group discussions | WebRTC mesh + WebSocket/HTTP-polling signaling | Not verifiable | Existing rooms retained; Groq STT route and participant opt-in UI | SFU, verified cross-NAT and multi-party concurrency |
| Meeting permissions | Client-supplied room codes / participant IDs | Not inspectable | No authorization redesign | Signed room identity, host permissions and audit |
| Session history | MongoDB and local cache | Reports are advertised | Existing persistence unchanged | Granular consent/retention and transcript deletion |

This is a partial functional upgrade, **not** a completed 12-phase implementation.
