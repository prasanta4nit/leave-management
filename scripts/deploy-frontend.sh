#!/usr/bin/env bash
# Build the React app with the stack's Cognito settings, upload to S3 and invalidate CloudFront.
# Usage: ./scripts/deploy-frontend.sh [stack-name]   (default: leavedesk)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STACK="${1:-leavedesk}"
out() { aws cloudformation describe-stacks --stack-name "$STACK" --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }

BUCKET="$(out FrontendBucketName)"
DIST="$(out DistributionId)"
REGION="$(aws configure get region || echo us-east-1)"

cat > "$ROOT/frontend/.env.production.local" <<ENV
VITE_AUTH_MODE=cognito
VITE_API_BASE_URL=/api
VITE_COGNITO_REGION=$REGION
VITE_COGNITO_USER_POOL_ID=$(out UserPoolId)
VITE_COGNITO_CLIENT_ID=$(out UserPoolClientId)
ENV

cd "$ROOT/frontend"
npm ci
npm run build
# Hashed assets can be cached forever; index.html must always revalidate.
aws s3 sync dist/ "s3://$BUCKET/" --delete --exclude index.html --cache-control "public,max-age=31536000,immutable"
aws s3 cp dist/index.html "s3://$BUCKET/index.html" --cache-control "no-cache"
aws cloudfront create-invalidation --distribution-id "$DIST" --paths "/index.html" "/" >/dev/null
echo "Deployed: $(out AppUrl)"
