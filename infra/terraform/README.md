# Employee Desk on AWS (Terraform)

Deploys the web app and API into an existing VPC. It does **not** create the MySQL database or the SES identity.

| Created here | Already yours |
|---|---|
| Cognito user pool and web client | VPC and private subnets |
| Lambda (FastAPI) in those subnets | MySQL and its security group |
| HTTP API, EventBridge schedules | Verified SES sender |
| Private S3 bucket and CloudFront | NAT gateway, unless you set `create_vpc_endpoints` |
| Inbound MySQL rule from the Lambda security group | The MySQL database and its tables |

CloudFront serves the site and forwards `/api/*` to API Gateway, so the browser uses one origin.

## Before apply

1. The MySQL database named in `db_name` already exists, including its tables. Bootstrap does not drop or alter them.
2. Database login is `db_username` and `db_password`. `db_secret_arn` is optional, only if that login is already stored in Secrets Manager.
3. The database user can read and write those tables.
4. Private subnets can reach the database, and can reach AWS APIs through a NAT gateway. If there is no NAT, set `create_vpc_endpoints = true`. That adds five interface endpoints, billed per Availability Zone. Endpoints only cover SES in `aws_region`; cross-region SES still needs NAT.
5. DNS hostnames and DNS resolution are enabled on the VPC.
6. `ses_sender` is already verified in SES. Sandbox accounts can send only to verified recipients.
7. From the repo root, build the Lambda bundle (Git Bash or WSL on Windows):

```bash
bash scripts/build-backend.sh
```

Re-run that script before `terraform apply` whenever backend code or `requirements.txt` changes. Terraform packages `backend/build`.

## Apply

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars   # then fill in real ids
terraform init
terraform apply
```

`terraform.tfvars` is gitignored.

## Frontend

From the repo root, build the site, then apply. The build script does not upload anything. `terraform apply` uploads `frontend/dist` to the site bucket.

```bash
bash scripts/deploy-frontend-terraform.sh
cd infra/terraform
terraform apply
```

## First admin

Tables are already in the database, so this step only fills what is still missing: default leave policies, India/Israel/Ukraine holiday calendars, and the first Admin. Existing rows are left alone. Cognito emails that admin a temporary password.

```bash
cd infra/terraform
FN="$(terraform output -raw lambda_function_name)"
aws lambda invoke --function-name "$FN" --cli-binary-format raw-in-base64-out \
  --payload '{"job":"bootstrap","admin_email":"you@company.com","admin_first_name":"First","admin_last_name":"Last","company_name":"Your Company"}' \
  response.json
cat response.json
```

Sign in as that admin and add employees. Each new employee gets a Cognito invite.

`terraform destroy` removes this stack: Cognito (including users), the Lambda, the API, schedules, and the site. It also removes the MySQL ingress rule this stack added. The database, its data, and the SES identity stay in place.

## Schedules

| Job | When | What |
|---|---|---|
| `accrual` | daily 00:15 | Missing balances and due monthly/quarterly accrual |
| `reminders` | weekdays 09:30 | Approvers with requests pending too long |
| `year-end` | 1 Jan 00:30 | Carry-forward from last year |

Times use `timezone` (default `Asia/Kolkata`).

## Cognito mail

Set `ses_identity_arn` so invite emails go out through the SES identity you already verified. Cognito can use an SES identity in the same region as the user pool. If AWS rejects that configuration, leave `ses_identity_arn` empty: invites use Cognito's built-in mail, and leave notifications still use `ses_sender`.
