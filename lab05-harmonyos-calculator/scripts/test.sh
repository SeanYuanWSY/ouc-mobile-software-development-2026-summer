#!/bin/bash
set -euo pipefail
source "$(dirname "$0")/environment.sh"
for suite in core geometry surface angle-mode; do
  "$STUDIO_DIR/tools/node/bin/node" "$PROJECT_DIR/tests/$suite.test.cjs"
done
