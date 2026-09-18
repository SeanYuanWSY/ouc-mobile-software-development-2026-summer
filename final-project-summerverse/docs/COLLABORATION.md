# Collaboration Workflow

## Repository location

The project is stored under:

```text
final-project-summerverse/
```

Open this folder as the project root in WeChat DevTools.

## Recommended branches

Use one branch per focused change:

```text
feat/island-animation
feat/twin-chat
feat-real-map
fix/permission-state
docs/deployment
```

Keep changes small enough to review. Avoid unrelated formatting sweeps.

## Local validation

```bash
cd final-project-summerverse
npm run verify
```

The command checks JavaScript syntax, JSON, page completeness, WXML risks, accidental API keys, asset sizes, and unit tests.

## Integration contracts

### Client to cloud

All cloud calls should go through the service layer in `miniprogram/services/`. Do not call cloud functions directly from presentation-only WXML components.

### Data trust labels

Every datum belongs to one of these classes:

1. `real`: user-created or returned by an authorized platform API.
2. `example`: manually imported demo content.
3. `generated`: AI-created narrative or draft.
4. `inferred`: statistics or model interpretation derived from real records.

Pages must preserve these distinctions visually and in stored records.

### AI safety and privacy

- Strict BYOK: each user supplies a session-only key; never fall back to developer/shared/environment keys.
- Only forward to the fixed official endpoint. Never log request arguments or raw upstream errors.
- Send the minimum memory context needed for the selected feature.
- Do not send raw media to AI without explicit user action.

## Current baseline and remaining work

Reviewed 2026-09-18. Read the latest dated section of `docs/ACCEPTANCE_STATUS.md` before interpreting older records.

- The former instructions to replace `touristappid` and create the initial cloud environment are outdated. `project.config.json` already contains the project AppID, and `miniprogram/config/env.js` enables its configured cloud environment. Do not replace these to force a local preview; use an explicitly isolated copy for offline tests.
- The 2026-09-17 acceptance record and `dist/relay-fix-20260916/experience-1.1.1.txt` record experience version 1.1.1, not an approved or publicly released version. The saved deployment verification covers 18 files across three updated functions; it does not prove real-account business flows. These are historical platform observations, not a fresh online check.
- The 2026-09-18 local check passed `npm run verify` with 206 tests, 16 pages and seven cloud-function directories. The local-only materials-page fix refreshes saved task state and revision after returning, while protecting unsaved edits and rejecting stale responses. Unknown storage state no longer claims local mode. Local and fixture tests are not evidence of real cloud, model, or cross-device connectivity.
- Initial GUI readback was unstable and CLI authorization was pending. After the user authorized it on 2026-09-18, CLI status succeeded and an actual home-button tap reached the materials page. After recompilation its storage-status text was verified as unknown, while the cloud-disconnected message persisted. This supersedes the authorization blocker, but does not pass the saved-task GUI round trip or real cloud flow. Do not treat the older synthetic demo as validation of these changes.

1. Resolve the external assistant entry and complete real phone-to-computer relay testing. Do not substitute environment-wide administrator credentials for end-user access.
2. Complete real-account material upload, parsing, save, restore and deletion checks, including cross-account isolation.
3. Complete user-entered BYOK text and vision requests, plus WeRun, location, weather and media device testing.
4. Verify the platform's saved privacy text and supplemental purposes; the last recorded pending-review state had a content readback discrepancy.
5. Profile island animation and image memory use on low-end phones.
6. Align `docs/DEMO_SCRIPT.md` and classroom materials with the features actually verified for the presentation. Do not present fixture relay results as a connected computer assistant.

Submitting code for WeChat platform review, uploading, public release and Git push require separate authorization. Local validation alone does not complete any of them.
