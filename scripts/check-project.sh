#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "Checking backend API..."
(cd "$ROOT_DIR/backend" && npm test)

echo "Checking Swift core..."
mkdir -p "$ROOT_DIR/.home" "$ROOT_DIR/.build/module-cache"
(
  cd "$ROOT_DIR"
  HOME="$ROOT_DIR/.home" \
  CLANG_MODULE_CACHE_PATH="$ROOT_DIR/.build/module-cache" \
  swift run PositionCircleChecks --scratch-path "$ROOT_DIR/.build"
)

echo "Checking Xcode project file..."
plutil -lint "$ROOT_DIR/iOSApp/PositionCircle.xcodeproj/project.pbxproj"

echo "All checks passed."
