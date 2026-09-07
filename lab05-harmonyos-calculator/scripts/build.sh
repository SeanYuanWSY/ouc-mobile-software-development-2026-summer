#!/bin/bash
# Authoritative source stays in the course repository; build intermediates use an ASCII path.
set -euo pipefail
source "$(dirname "$0")/environment.sh"
[[ "${1:-}" != '--check-env' ]] || { echo 'Build paths and external volume verified.'; exit 0; }
# Refuse to adopt an arbitrary populated directory. Existing Orbit build copies are supported.
"$STUDIO_DIR/tools/node/bin/node" - "$BUILD_DIR" <<'NODE'
const fs = require('node:fs'); const path = require('node:path');
const dir = process.argv[2];
if (fs.existsSync(dir) && fs.readdirSync(dir).length) {
  if (fs.existsSync(path.join(dir, '.git'))) throw Error('Refusing to overwrite a Git checkout.');
  let app;
  try { app = JSON.parse(fs.readFileSync(path.join(dir, 'AppScope/app.json5'), 'utf8')).app; } catch (_) {}
  if (!app || app.bundleName !== 'com.wsy.orbitcalc') throw Error('Nonempty target is not an Orbit build copy. Use an empty dedicated directory.');
}
NODE
mkdir -p "$BUILD_DIR"
# No --delete: do not remove existing local build/debug files.
rsync -a --exclude '.git' --exclude '.idea' --exclude 'build' --exclude '.hvigor' --exclude 'oh_modules' --exclude 'local.properties' --exclude '.orbit.local.env' --exclude 'VERIFICATION.md' "$PROJECT_DIR/" "$BUILD_DIR/"
export NODE_HOME="$STUDIO_DIR/tools/node"
export JAVA_HOME="$STUDIO_DIR/jbr/Contents/Home"
export DEVECO_SDK_HOME="$STUDIO_DIR/sdk"
export PATH="$NODE_HOME/bin:$JAVA_HOME/bin:$PATH"
cd "$BUILD_DIR"
"$STUDIO_DIR/tools/hvigor/bin/hvigorw" --mode module -p product=default -p module=entry@default assembleHap --no-daemon
echo "HAP: $BUILD_DIR/entry/build/default/outputs/default/entry-default-unsigned.hap"
