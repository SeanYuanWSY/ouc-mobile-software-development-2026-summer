# Changelog

## 1.0.1 — production hardening

- Verify the deployed `dataService` before switching from local storage to cloud mode.
- Prevent failed cloud writes and cloud media uploads from silently producing split local data.
- Validate AI structured output and reject director chapters that reference unknown memory IDs.
- Enforce the nine-attachment limit and request microphone permission explicitly.
- Add confirmation before destructive demo removal and local backup restore.
- Add WXML event/route checks, integrity-manifest verification, and regression tests.
- Make shared/direct-open pages return to the island when no previous page exists.
- Protect the shared DeepSeek key with per-user and global transactional quotas, and bind AI vision files to the current WeChat user.
- Validate cloud-media ownership on memory writes, check per-file deletion results, retain failed cleanup records for retry, and constrain local deletion to app-created files.
- Track attachment references transactionally, protect concurrent saves from stale cleanup, and roll back only files created by a failed save attempt.
- Apply a lightweight minute gate before AI vision downloads, then reserve daily and shared credits only after payload and file validation.
- Record simulator acceptance separately from real-account, cloud, permission, and device acceptance.
- Replace legacy Canvas APIs with Canvas 2D for the director poster and report radar chart, with verified runtime export and rendering.
- Reject invalid microphone permission declarations during project checks and make long environment diagnostics selectable.

## 1.0.0 — collaboration baseline

- Locked the A + A design direction: growing island home and SummerTwin garden cottage.
- Added 12 native WeChat Mini Program pages and reusable scrapbook components.
- Added local/cloud dual-mode storage and five cloud functions.
- Added DeepSeek text, structured-output, vision, Time Phone, Parallel Summer, and AI Director flows.
- Added real-data integrations for WeRun, location/map, media, and weather.
- Added validation scripts, unit tests, deployment docs, privacy notes, and collaboration guidance.
