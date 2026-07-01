#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "Checking backend API..."
(cd "$ROOT_DIR/backend" && npm test)

echo "Checking structural health score..."
(cd "$ROOT_DIR/backend" && npm run test:advice)

echo "Checking market data (Yahoo) symbol mapping..."
(cd "$ROOT_DIR/backend" && npm run test:market)

echo "Checking Telegram digest / webhook / change push..."
(cd "$ROOT_DIR/backend" && npm run test:telegram)

echo "All checks passed."
