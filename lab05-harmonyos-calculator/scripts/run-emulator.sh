#!/bin/bash
set -euo pipefail
source "$(dirname "$0")/environment.sh"
DEVICE="${ORBIT_DEVICE:-127.0.0.1:5555}"
HDC="$STUDIO_DIR/sdk/default/openharmony/toolchains/hdc"
[[ -f "$BUILD_DIR/entry/build/default/outputs/default/entry-default-unsigned.hap" ]] || { echo 'Build the HAP first.' >&2; exit 1; }
"$HDC" -t "$DEVICE" install -r "$BUILD_DIR/entry/build/default/outputs/default/entry-default-unsigned.hap"
"$HDC" -t "$DEVICE" shell aa start -a EntryAbility -b com.wsy.orbitcalc
