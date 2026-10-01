data "archive_file" "lambda" {
  type        = "zip"
  source_dir  = "${path.module}/../../backend/build"
  output_path = "${path.module}/.build/lambda.zip"
}

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda" {
  name               = "${local.name}-api"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "lambda_vpc" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

data "aws_iam_policy_document" "lambda" {
  statement {
    sid    = "SendMail"
    effect = "Allow"
    actions = [
      "ses:SendEmail",
      "ses:SendRawEmail",
    ]
    resources = [
      var.ses_identity_arn != "" ? var.ses_identity_arn : "arn:aws:ses:${local.ses_region}:${data.aws_caller_identity.current.account_id}:identity/*",
      # When the identity has a default configuration set (e.g. for bounce/open tracking), SES also
      # checks permission on that configuration set. Without this every send fails with AccessDenied.
      "arn:aws:ses:${local.ses_region}:${data.aws_caller_identity.current.account_id}:configuration-set/*",
    ]
  }

  dynamic "statement" {
    for_each = var.db_secret_arn == "" ? [] : [var.db_secret_arn]
    content {
      sid       = "ReadDatabaseSecret"
      effect    = "Allow"
      actions   = ["secretsmanager:GetSecretValue"]
      resources = [statement.value]
    }
  }

  dynamic "statement" {
    for_each = var.db_kms_key_arn == "" ? [] : [var.db_kms_key_arn]
    content {
      sid       = "DecryptDatabaseSecret"
      effect    = "Allow"
      actions   = ["kms:Decrypt"]
      resources = [statement.value]
    }
  }

  statement {
    sid       = "ReadAppUrl"
    effect    = "Allow"
    actions   = ["ssm:GetParameter"]
    resources = [local.app_url_param_arn]
  }

  statement {
    sid    = "ProvisionEmployees"
    effect = "Allow"
    actions = [
      "cognito-idp:AdminCreateUser",
      "cognito-idp:AdminEnableUser",
      "cognito-idp:AdminDisableUser",
    ]
    resources = [aws_cognito_user_pool.this.arn]
  }
}

resource "aws_iam_role_policy" "lambda" {
  name   = "${local.name}-api"
  role   = aws_iam_role.lambda.id
  policy = data.aws_iam_policy_document.lambda.json
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/lambda/${local.name}-api"
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "api" {
  function_name = "${local.name}-api"
  description   = "LeaveDesk FastAPI and scheduled jobs"
  role          = aws_iam_role.lambda.arn
  runtime       = "python3.12"
  architectures = ["arm64"]
  handler       = "app.main.handler"
  memory_size   = var.lambda_memory_mb
  timeout       = var.lambda_timeout_seconds

  filename         = data.archive_file.lambda.output_path
  source_code_hash = data.archive_file.lambda.output_base64sha256

  vpc_config {
    subnet_ids         = var.private_subnet_ids
    security_group_ids = [aws_security_group.lambda.id]
  }

  environment {
    variables = merge(
      {
        ENVIRONMENT           = var.stage
        AUTH_MODE             = "cognito"
        COGNITO_REGION        = var.aws_region
        COGNITO_USER_POOL_ID  = aws_cognito_user_pool.this.id
        COGNITO_APP_CLIENT_ID = aws_cognito_user_pool_client.web.id
        EMAIL_ENABLED         = "true"
        SES_REGION            = local.ses_region
        SES_SENDER            = var.ses_sender
        FRONTEND_URL_PARAM    = local.app_url_param_name
        CORS_ORIGINS          = "http://localhost:5173"
      },
      local.database_env,
    )
  }

  depends_on = [
    aws_iam_role_policy.lambda,
    aws_iam_role_policy_attachment.lambda_basic,
    aws_iam_role_policy_attachment.lambda_vpc,
    aws_cloudwatch_log_group.api,
  ]
}
