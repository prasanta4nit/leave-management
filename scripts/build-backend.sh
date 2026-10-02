#!/usr/bin/env bash
# Builds the Lambda bundle (Linux arm64 / Python 3.12) into backend/build without Docker.
# Does not run terraform apply. Run that yourself from infra/terraform.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/backend/build"
PY="${PYTHON:-python3}"
command -v "$PY" >/dev/null 2>&1 || PY=python

rm -rf "$OUT" && mkdir -p "$OUT"
"$PY" -m pip install --quiet \
  --platform manylinux2014_aarch64 --implementation cp --python-version 3.12 --only-binary=:all: \
  --target "$OUT" -r "$ROOT/backend/requirements.txt"
# boto3 is already in the Lambda runtime; drop it to keep the bundle small.
rm -rf "$OUT"/boto3* "$OUT"/botocore* "$OUT"/s3transfer*
cp -r "$ROOT/backend/app" "$OUT/app"
find "$OUT" -name "__pycache__" -type d -prune -exec rm -rf {} +
echo "Lambda bundle ready: $OUT ($(du -sh "$OUT" | cut -f1))"
