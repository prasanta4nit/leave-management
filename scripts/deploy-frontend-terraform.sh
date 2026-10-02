#!/usr/bin/env bash
# Build the React app into frontend/dist with Cognito settings from Terraform outputs.
# Does not run terraform apply, upload to S3, or invalidate CloudFront.
# Usage: ./scripts/deploy-frontend-terraform.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TF=(terraform -chdir="$ROOT/infra/terraform")
out() { "${TF[@]}" output -raw "$1"; }

REGION="$(out region)"

cat > "$ROOT/frontend/.env.production.local" <<ENV
VITE_AUTH_MODE=cognito
VITE_API_BASE_URL=/api
VITE_COGNITO_REGION=$REGION
VITE_COGNITO_USER_POOL_ID=$(out user_pool_id)
VITE_COGNITO_CLIENT_ID=$(out user_pool_client_id)
ENV

cd "$ROOT/frontend"
npm ci
npm run build
echo "Frontend build ready: $ROOT/frontend/dist"
