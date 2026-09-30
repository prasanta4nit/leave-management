#!/usr/bin/env bash
# Build the React app with Cognito settings from Terraform outputs, upload to S3,
# and invalidate CloudFront.
# Usage: ./scripts/deploy-frontend-terraform.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TF=(terraform -chdir="$ROOT/infra/terraform")
out() { "${TF[@]}" output -raw "$1"; }

BUCKET="$(out frontend_bucket_name)"
DIST="$(out distribution_id)"
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
aws s3 sync dist/ "s3://$BUCKET/" --delete --exclude index.html --cache-control "public,max-age=31536000,immutable"
aws s3 cp dist/index.html "s3://$BUCKET/index.html" --cache-control "no-cache"
aws cloudfront create-invalidation --distribution-id "$DIST" --paths "/index.html" "/" >/dev/null
echo "Deployed: $(out app_url)"
