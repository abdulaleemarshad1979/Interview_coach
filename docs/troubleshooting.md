# Troubleshooting

| Symptom | Action |
| --- | --- |
| Groq is not configured | Set server GROQ_API_KEY. Use /api/voice/status while signed in; this reports configuration, not successful provider requests. |
| Model/voice access rejected | Verify current account model access and accepted TTS terms against official Groq docs. Defaults are configurable; do not silently fabricate an interview. |
| No microphone / permission denied | Use HTTPS or localhost, grant site permission, check the OS microphone switch, and choose an available device after permission. Typed answers remain available. |
| Interview answer saved but next question failed | Open history, resume, and select Retry saved turn. The stable request ID prevents duplicated answer entries. |
| Session shows processing after a disconnected request | Refresh/resume; a bounded database lease protects concurrent operations. Cancel request explicitly when appropriate. |
| Playback blocked | Use Replay question after a user gesture. Check output device/browser autoplay settings. Browser speech is an explicit device-dependent alternative. |
| Meeting service awaiting setup | Configure LiveKit WSS URL and server API key/secret. Local WS is accepted only on loopback outside production. |
| Participant waiting / no token | Host must admit the signed-in identity. Check the passcode. A client-provided host flag cannot grant admission. |
| Media works locally but not across networks | Validate LiveKit advertised public IP, UDP/TCP media reachability and TURN/TLS using separate networks. A STUN-only or local Docker result does not establish NAT traversal. |
| Reconnecting or disconnected | Check network and SFU health; the SDK reconnects. Use Rejoin if the transport is fully closed. A removed/ended participant must not receive a new token. |
| Transcript missing | Each participant must separately consent and unmute their own microphone. Check provider configuration and visible capture failure. Unsupported capture or failed chunks are disclosed, not silently scored. |
| Report unscored / insufficient evidence | No reliable transcript means no supported score. A report with words from another identity or invented quotes is rejected. |
| Admin/faculty access disappeared | Add the legitimate account email to server allowlists and run staff:provision for the verified account. Audit historical browser-granted flags; public signup cannot claim it. |
| Legacy invitation returns 410 | The unauthenticated mesh transport was retired. Create a secure discussion and issue a new invitation. Legacy database records are preserved. |
| Resume URL rejected / invalid PDF | Upload a valid unencrypted PDF (at most 5 MB) directly. Remote URL fetching is disabled to prevent SSRF. |
| Auth/database unavailable | Verify MongoDB configuration/network access and retry. Temporary API failures retain the browser's session; expired/invalid sessions require sign-in. |
| Rate limit after proxy deployment | Set the exact TRUST_PROXY_HOPS count and authorized APP_URL/origins. Production counters are shared through MongoDB. |

Do not paste server keys, passwords or complete private transcripts into logs or issue reports. Include the stable error code, timestamp and affected flow instead.
