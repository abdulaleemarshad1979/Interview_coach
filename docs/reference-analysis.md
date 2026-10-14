# Public iQua reference analysis

Observed 2026-10-14 at [the supplied reference application](https://adityauniversity.iqua.ai/). This is a public, unauthenticated investigation. Reference copy is treated as an advertised capability, not proof of execution.

## Method and evidence boundaries

The installed `reverse-engineer-anything` and `browser-testing-with-devtools` skill instructions were read. No REA or Chrome DevTools MCP tools were exposed in the active session. CUA browser automation opened the reference and captured landing, sign-in, required-field validation, and recovery states. After an interrupted turn, the in-app browser was unavailable; an isolated Playwright browser context with no saved accounts or user profile continued public navigation and responsive observation. Evidence is browser observation, not REA analysis or recovered source.

Only normal public UI actions and read-only DOM/layout/resource observations were used. No login was attempted with invented credentials, no OTP was sent, no private endpoint was queried, no credentials or browser storage were inspected, and no implementation bundle was extracted. Screenshots document the reference; its branding and assets are not implementation resources.

## Accessible feature observations

| Evidence | User action and visible state | Input/output and transition | Loading/error/timing observations | Independent implementation requirement |
| --- | --- | --- | --- | --- |
| REF-01 | Open the landing page | University logo, interview-focused hero, sign-in actions, and feature sections appear | Document and observed public resources loaded; the retained fresh isolated navigation reached network idle in 1.94 s, including public video resources. This is one environment-specific sample, not a speed guarantee | Clear purpose, one primary interview entry, and a visible loading/failure state |
| REF-02 | Read public feature descriptions | Skill/role-based AI interviews, metrics, sharing, proctoring, class tests, and institutional administration are advertised | The descriptions do not demonstrate the authenticated workflows or the providers behind them | Personalization, evidence-based reports, and usable history without inferring private implementation |
| REF-03 | Select top/hero sign-in | Route changes from `/` to `/sign-in`; email and masked password fields plus a sign-in button appear | No credentials supplied; successful sign-in, server rejection, and onboarding are unverified | Accessible labeled email/password controls, safe authentication, and specific errors |
| REF-04 | Select Sign In with empty fields | Browser-required-field validation focuses email; route remains `/sign-in` | The visible message is native browser validation. The email input is rendered as text, and both fields are required | Use `type=email`, required fields, and accessible validation |
| REF-05 | Select Forgot Password | Route changes to `/forgot-password`; an input and disabled Send OTP button appear | No address entered or OTP requested; delivery, rate limits, and completion are unverified. The captured AX state exposes no descriptive input label | Clearly labeled recovery input and secure, rate-limited recovery if this product supports it |
| REF-06 | Select Experience AI Interviews in the public feature area | The captured unauthenticated action did not produce a visible route transition | The observation window establishes no accessible interview room; it does not prove a failure for authenticated users | Public calls to action should take users to configuration or sign-in with the intended next step preserved |
| REF-07 | Read institutional feature preview | A sample test table, class-test/report descriptions, and Learn More buttons are visible on desktop | The sample table is public illustration, not retrieved student/test data; actual creation, invitations, and reporting were not exercised | Reuse existing institutional workflows; isolate sample illustrations from actual session records |
| REF-08 | Read sharing and FAQ areas | Public descriptions discuss recording, skill assessment, feedback, and sharing with recruiters | No actual recorded interview or recruiter delivery was accessed | Report/export features need ownership checks and real transcript evidence |
| REF-09 | Observe desktop and a 390×844 mobile viewport | Desktop landing width matches viewport; mobile landing document is 467 px wide at 390 px. Mobile sign-in fits 390 px and stacks content | Horizontal overflow was measured directly. Some below-fold animated sections are not painted in the first full-page capture | Responsive layouts without horizontal overflow, and reduced-motion-compatible visibility |
| REF-10 | Inspect accessible structure and runtime warnings | Landing DOM contains 24 `h1` elements; several feature labels are exposed as text rather than semantic tab controls | Two VideoJS deprecation warnings were captured in the isolated public run; no page exception was captured. This is limited to the public actions observed | One main heading, coherent heading levels, semantic buttons/tabs, keyboard navigation, and clean runtime diagnostics |
| REF-11 | Select Performance Metrics and Share Interview feature labels | The public description changes; sharing selection receives a highlighted card and exposes Share Now, metrics exposes See How it works; route remains `/` | This is marketing-panel switching, not report generation or successful recruiter sharing | Use semantic keyboard-operable tabs and keep previews distinct from real results |
| REF-12 | Select the AI-technology FAQ item | The selected item's chevron changes to an expanded state; route remains `/` | The immediate screenshot shows the changed chevron, while answer rendering/animation was not timed | Accessible accordion expansion state and content that does not require animation to remain available |

## Screenshot index

| File | Captured state |
| --- | --- |
| [01-public-landing-desktop.jpg](reference-screenshots/01-public-landing-desktop.jpg) | Initial CUA landing page |
| [02-sign-in-desktop.jpg](reference-screenshots/02-sign-in-desktop.jpg) | CUA sign-in page |
| [03-sign-in-required-fields.jpg](reference-screenshots/03-sign-in-required-fields.jpg) | Empty sign-in validation |
| [04-password-recovery.jpg](reference-screenshots/04-password-recovery.jpg) | Public recovery page; OTP not sent |
| [05-public-landing-desktop-isolated.png](reference-screenshots/05-public-landing-desktop-isolated.png) | Fresh isolated desktop public page |
| [06-interview-entry-action.png](reference-screenshots/06-interview-entry-action.png) | Captured public interview CTA result |
| [07-public-landing-mobile.png](reference-screenshots/07-public-landing-mobile.png) | 390-pixel mobile public page |
| [08-sign-in-mobile.png](reference-screenshots/08-sign-in-mobile.png) | Stacked mobile sign-in |
| [09-feature-performance-metrics.png](reference-screenshots/09-feature-performance-metrics.png) | Metrics marketing panel |
| [10-feature-share-interview.png](reference-screenshots/10-feature-share-interview.png) | Highlighted sharing panel and public CTA |
| [11-public-faq-expanded.png](reference-screenshots/11-public-faq-expanded.png) | Selected FAQ chevron state immediately after activation |

The first full-page capture may leave scroll-triggered sections unpainted. Visible copy was cross-checked through DOM observations; blank screenshot regions are not claimed to be missing functionality. [Public observation metadata](reference-screenshots/public-observation.json) retains only public response origin/path/status, warnings, observation time, and the navigation sample. It does not contain request headers, cookies, tokens, account data, or script source.

## Unverified authenticated features

No authorized reference account was supplied. Student dashboard, interview configuration, actual interviewer turns, voice quality/identity, speech latency, candidate recording behavior, group setup, multi-user meeting controls, AI observer, reports, scoring details, session history, authorization, and persistence remain unverified. No public group-discussion control was observed in the inspected landing/sign-in/recovery states. This bounded observation does not establish that the reference lacks a group-discussion product.

The public site cannot establish an SFU, Zoom, WebRTC topology, AI provider, database, or a particular scoring algorithm. LiveKit and Groq are independent implementation choices for Interview Coach and require their own verification. Requested capabilities hidden by authentication remain open research questions rather than invented observations.
