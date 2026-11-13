# College portal login

Observed on 14 October 2026. The supplied account was tested through normal student login on the official ACET portal, the Sandyy temporary login, and the direct adapter. Credentials and student profile responses are excluded from this report and test fixtures.

## Observed protocol

| Portal | Login page | Student fields | Submit control |
| --- | --- | --- | --- |
| ACET | https://info.aec.edu.in/acet/default.aspx | `txtId2`, `txtPwd2`, `hdnpwd2` | `imgBtn2.x`, `imgBtn2.y` |
| AUS | https://info.aec.edu.in/aus/default.aspx | `userType=rbtStudent`, `txtUserId`, `txtPassword`, `hdnpwd` | `btnLogin=LOGIN` |

Both pages use the public `encryptJSText` function: AES-128-CBC with PKCS7 padding and the same public key/IV string `8701661282118308`. Both password controls contain the resulting Base64 ciphertext when submitted. The official ACET form encrypts on `keyup` and copies the hidden value on `blur`; filling its password field without keyboard events can therefore submit an empty ciphertext and cause a portal runtime error.

Initial requests can redirect through `authcheck.aspx`. Each verification keeps its own ASP.NET session cookies, form state, event validation, and dynamic `hdnDPToken`. After login, the adapter requires the authenticated `StudentMaster.aspx` page and its logout control, then loads the profile page. It discovers the current `StudentProfile,...ashx` script rather than hardcoding the ASP.NET build hash. `ShowStudentProfileNew` accepts the existing AjaxPro text body with `RollNo` and `isImageDisplay` fields.

The public Sandyy bundle observed at `https://attendance.sandyy.in/assets/index-cw4zBcnG.js` submits `rollNumber`, `password`, `campus`, and `turnstileToken` to `https://attendance-api.sandyy.in/api/verify`. That browser login succeeded for the supplied ACET account. InterviewCoach verifies directly against the official college portal; Sandyy is a reference for the flow rather than a dependency receiving InterviewCoach credentials.

## AUS constraint

The current AUS form includes Cloudflare Turnstile. The widget and resulting verification are scoped to the official portal. InterviewCoach reports `PORTAL_VERIFICATION_REQUIRED` with the official login link when that verification is required. Visiting that link does not transfer a session back to InterviewCoach. Reliable AUS integration needs university-supported authentication or an approved verification bridge; it is not claimed to work around Turnstile. No AUS account was supplied for live authentication testing.

## Application flow

`POST /api/college/login` validates an explicit college selection, verifies its current ECAP credentials, and creates or reuses the local student account before returning `{user, session, profile}`. Successful verification binds the college in server-owned metadata. Existing account IDs, profile ownership, saved interview metadata, and selected section are preserved. New college accounts store an unrelated random local password hash; they authenticate through the college endpoint. The generic local password and signup endpoints return `410` in normal operation.

`POST /api/college/sync-portal` repeats verification for the signed-in student's bound college and updates the stored profile. Legacy `/api/college/auth-sync` verification tickets also carry the verified college identity. The UI holds the submitted password in memory only and clears it after login; profile sync requests a password again.

HTTP requests use decoded responses, an overall 25-second portal deadline, a 2 MiB decoded response limit, and at most eight redirects. Redirects stay on HTTPS within the chosen college path. Errors distinguish invalid credentials, browser verification, outages, changed forms, and invalid profiles. Logs contain failure codes only, without passwords, cookies, or returned HTML.

## Validation

- Live official ACET browser login succeeded after using the form's native keyboard events.
- Live direct adapter login succeeded and returned the account's actual name, department, photo URL, and attendance.
- Live local application browser login succeeded and displayed the correct student name and 78.4% attendance. It used an isolated disposable MongoDB database, independent of production.
- Automated tests cover verification before session issuance, existing accounts after ECAP password changes, stale local passwords, profile ownership, staff restrictions, college selection, failed upstream requests, dynamic profile handlers, cookies, redirects, compression, and response limits.

Run `npm run lint`, `npm test`, and `npm run build` for local checks. Live portal checks are manual and deliberately excluded from the automated suite to avoid repeated login attempts against real student accounts.

Production requires deploying the updated server and frontend together. Allow enough function duration for the 25-second portal deadline and the configured 10-second database connection timeout.
