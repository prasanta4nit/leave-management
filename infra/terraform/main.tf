# LeaveDesk on AWS, using a database and SES identity that already exist.
# This stack creates Cognito, the API Lambda, HTTP API, EventBridge schedules,
# and the S3 + CloudFront site. It does not create a VPC, RDS instance, or SES identity.

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = local.tags
  }
}

# SES is regional. Cognito's send authorization is applied in the identity's region,
# which may differ from the region the app runs in.
provider "aws" {
  alias  = "ses"
  region = var.ses_region != "" ? var.ses_region : var.aws_region

  default_tags {
    tags = local.tags
  }
}

data "aws_caller_identity" "current" {}

data "aws_region" "current" {}

locals {
  name = "leavedesk-${var.stage}"

  ses_region = var.ses_region != "" ? var.ses_region : var.aws_region

  # Fixed name so the Lambda environment and IAM policy do not reference the
  # parameter resource. That parameter's value is the CloudFront URL, and
  # CloudFront depends on the API, which depends on the Lambda.
  app_url_param_name = "/leavedesk/${var.stage}/app-url"
  app_url_param_arn  = "arn:aws:ssm:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:parameter${local.app_url_param_name}"

  ses_identity_name = var.ses_identity_arn == "" ? "" : split("identity/", var.ses_identity_arn)[1]

  database_env = var.db_secret_arn != "" ? {
    DB_SECRET_ARN = var.db_secret_arn
    DB_HOST       = var.db_host
    DB_PORT       = tostring(var.db_port)
    DB_NAME       = var.db_name
    } : {
    DATABASE_URL = "mysql+pymysql://${urlencode(var.db_username)}:${urlencode(var.db_password)}@${var.db_host}:${var.db_port}/${var.db_name}?charset=utf8mb4"
  }

  tags = merge(
    {
      Project     = "leavedesk"
      Environment = var.stage
      ManagedBy   = "terraform"
    },
    var.tags,
  )
}
