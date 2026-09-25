#!/usr/bin/env bash
# One-time setup after the first deploy: creates tables, default leave policies and the first Admin
# (Cognito emails them a temporary password).
# Usage: ./scripts/bootstrap.sh admin@company.com "First" "Last" "Company Name" [stack-name]
set -euo pipefail
EMAIL="$1"; FIRST="$2"; LAST="$3"; COMPANY="$4"; STACK="${5:-leavedesk}"
FN="$(aws cloudformation describe-stacks --stack-name "$STACK" --query "Stacks[0].Outputs[?OutputKey=='ApiFunctionName'].OutputValue" --output text)"
PAYLOAD=$(printf '{"job":"bootstrap","admin_email":"%s","admin_first_name":"%s","admin_last_name":"%s","company_name":"%s"}' "$EMAIL" "$FIRST" "$LAST" "$COMPANY")
aws lambda invoke --function-name "$FN" --cli-binary-format raw-in-base64-out --payload "$PAYLOAD" /dev/stdout
echo
