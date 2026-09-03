# SummerVerse Agent Collaboration Guide

This folder contains the final-course-project implementation of **SummerVerse**, a native WeChat Mini Program.

## Product decisions already locked

- Visual direction: **hand-drawn scrapbook / warm paper texture**.
- Core combination: **A + A**.
  - Home: a growing **summer island planet**.
  - AI companion: **SummerTwin garden cottage**.
- Product principle: never present demo, generated, or inferred data as real user data.
- Real-data integrations: WeRun steps, location/map, weather, media, cloud database.
- AI provider: DeepSeek through `cloudfunctions/deepseekProxy`; production keys stay server-side.

## Start here

1. Read `README.md`.
2. Read `docs/COLLABORATION.md` and `docs/CLOUD_SETUP.md`.
3. Run `npm run verify` before and after changes.
4. Import this folder directly into WeChat DevTools.

## Important boundaries

- Do not commit `project.private.config.json`, `miniprogram/config/private.js`, `.env`, API keys, or cloud secrets.
- Do not replace real-data empty states with fabricated numbers.
- AI output must remain visibly labeled as generated/inferred.
- Time Phone may only receive memories at or before the selected date.
- Parallel Summer output must never be inserted into factual memories without explicit user confirmation.
- Preserve the selected hand-drawn design system unless a change is explicitly approved.

## Suggested ownership split

- `miniprogram/pages/island`, `miniprogram/pages/twin`: signature UI and animation.
- `miniprogram/pages/*`: feature-page implementation.
- `miniprogram/services`, `miniprogram/utils`: client logic and data contracts.
- `cloudfunctions`: server-side integrations and security.
- `tests`, `scripts`: quality gates.
- `docs`: deployment, API matrix, privacy, and demo materials.

## Pull request checklist

- [ ] `npm run verify` passes.
- [ ] No secret or private config is committed.
- [ ] Empty/loading/error/permission-denied states are handled.
- [ ] Real, example, and AI-generated data remain distinguishable.
- [ ] WXML contains no unsupported JavaScript expressions.
- [ ] New permissions are documented in `docs/PRIVACY.md`.
- [ ] New backend contracts are documented in `docs/API_MATRIX.md`.
