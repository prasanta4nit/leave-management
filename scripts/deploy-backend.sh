#!/usr/bin/env bash
# Build + deploy the whole stack (API, DB, Cognito, SES identity, S3, CloudFront).
# First run: ./scripts/deploy-backend.sh --guided   (stores answers in infra/samconfig.toml)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
"$ROOT/scripts/build-backend.sh"
cd "$ROOT/infra"
sam deploy --template-file template.yaml --capabilities CAPABILITY_IAM --resolve-s3 "$@"
