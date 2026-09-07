#!/bin/bash
# Local configuration is trusted shell code, deliberately excluded from Git.
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
if [[ -f "$PROJECT_DIR/.orbit.local.env" ]]; then
  source "$PROJECT_DIR/.orbit.local.env"
fi
: "${DEVECO_STUDIO_DIR:?Set DEVECO_STUDIO_DIR to the DevEco Contents directory.}"
: "${ORBIT_BUILD_DIR:?Set ORBIT_BUILD_DIR to a dedicated ASCII build directory.}"
STUDIO_DIR="$DEVECO_STUDIO_DIR"
BUILD_DIR="$ORBIT_BUILD_DIR"
[[ -x "$STUDIO_DIR/tools/node/bin/node" ]] || { echo 'DevEco Node runtime is unavailable.' >&2; exit 1; }
# Resolve existing parents without creating anything, including symlink aliases.
CANONICAL_PATHS="$("$STUDIO_DIR/tools/node/bin/node" - "$PROJECT_DIR" "$STUDIO_DIR" "$BUILD_DIR" <<'NODE'
const fs = require('node:fs'); const path = require('node:path');
function resolveExisting(p) {
  if (!path.isAbsolute(p) || /[\r\n]/.test(p)) throw Error('Use absolute paths without line breaks.');
  p = path.normalize(p);
  if (fs.existsSync(p)) return fs.realpathSync(p);
  if (fs.lstatSync(p, {throwIfNoEntry:false})) throw Error('Broken symlink in build path.');
  return path.join(resolveExisting(path.dirname(p)), path.basename(p));
}
const [project, studio, build] = process.argv.slice(2).map(resolveExisting);
function within(a, b) { return a === b || a.startsWith(b + path.sep); }
let repository = project;
for (let p = project; p !== path.dirname(p); p = path.dirname(p)) {
  if (fs.existsSync(path.join(p, '.git'))) { repository = p; break; }
}
if (!/^[\x20-\x7e]+$/.test(build)) throw Error('Build path must contain ASCII characters only.');
if ([repository, studio].some(p => within(build, p) || within(p, build))) throw Error('Build target overlaps source repository or DevEco.');
if (['/', '/tmp', '/private/tmp', '/Users', '/Volumes', '/Applications', process.env.HOME].includes(build) || /^\/Volumes\/[^/]+$/.test(build)) throw Error('Use a dedicated build subdirectory, not a shared root.');
if (fs.existsSync(build) && !fs.statSync(build).isDirectory()) throw Error('Build target is not a directory.');
console.log([project, studio, build].join('\n'));
NODE
)" || exit 1
PROJECT_DIR="$(printf '%s\n' "$CANONICAL_PATHS" | sed -n '1p')"
STUDIO_DIR="$(printf '%s\n' "$CANONICAL_PATHS" | sed -n '2p')"
BUILD_DIR="$(printf '%s\n' "$CANONICAL_PATHS" | sed -n '3p')"
# Validate external paths before any write or installation.
for candidate in "$STUDIO_DIR" "$BUILD_DIR"; do
  if [[ "$candidate" == /Volumes/* ]]; then
    : "${ORBIT_VOLUME_PATH:?External paths require ORBIT_VOLUME_PATH.}"
    : "${ORBIT_VOLUME_UUID:?External paths require ORBIT_VOLUME_UUID.}"
    [[ "$candidate" == "$ORBIT_VOLUME_PATH/"* ]] || { echo 'External path is outside the configured volume.' >&2; exit 1; }
    VOLUME_INFO="$(diskutil info -plist "$ORBIT_VOLUME_PATH")" || exit 1
    ACTUAL_UUID="$(printf '%s' "$VOLUME_INFO" | plutil -extract VolumeUUID raw -o - -)" || exit 1
    ACTUAL_MOUNT="$(printf '%s' "$VOLUME_INFO" | plutil -extract MountPoint raw -o - -)" || exit 1
    [[ "$ACTUAL_UUID" == "$ORBIT_VOLUME_UUID" && "$ACTUAL_MOUNT" == "$ORBIT_VOLUME_PATH" ]] || { echo 'Expected external volume is not mounted. Stopped.' >&2; exit 1; }
  fi
done
export DEVECO_STUDIO_DIR="$STUDIO_DIR"
