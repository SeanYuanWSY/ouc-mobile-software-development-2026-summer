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

- Production DeepSeek keys belong in cloud-function environment variables.
- Temporary client keys are development-only and must not persist.
- Send the minimum memory context needed for the selected feature.
- Do not send raw media to AI without explicit user action.

## High-priority remaining work

1. Replace `touristappid` with the real AppID in a private local config.
2. Create the CloudBase environment and deploy the five cloud functions.
3. Complete WeRun, location, weather, media, and cloud-database device testing.
4. Test DeepSeek text and vision calls with real credentials.
5. Complete privacy declarations and permission-denied UX.
6. Profile island animation and image memory use on low-end phones.
7. Capture final demo data and rehearse `docs/DEMO_SCRIPT.md`.
