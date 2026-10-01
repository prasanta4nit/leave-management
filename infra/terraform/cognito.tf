resource "aws_cognito_user_pool" "this" {
  name = local.name

  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  admin_create_user_config {
    allow_admin_create_user_only = true

    invite_message_template {
      email_subject = "Your LeaveDesk account"
      email_message = "Welcome to LeaveDesk! Sign in with username {username} and temporary password {####}. You'll be asked to choose a new password. Your HR team will share the app link."
      # Cognito requires an SMS template whenever the invite template is set, even though invites are sent by email.
      sms_message = "LeaveDesk username {username}, temporary password {####}."
    }
  }

  password_policy {
    minimum_length                   = 8
    require_lowercase                = true
    require_uppercase                = true
    require_numbers                  = true
    require_symbols                  = false
    temporary_password_validity_days = 7
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  schema {
    name                = "email"
    attribute_data_type = "String"
    required            = true
    mutable             = true
  }

  dynamic "email_configuration" {
    for_each = var.ses_identity_arn == "" ? [] : [1]
    content {
      email_sending_account = "DEVELOPER"
      source_arn            = var.ses_identity_arn
      from_email_address    = var.ses_sender
    }
  }

  # Standard attributes cannot be edited after the pool exists.
  lifecycle {
    ignore_changes = [schema]
  }

  depends_on = [aws_ses_identity_policy.cognito]
}

resource "aws_cognito_user_pool_client" "web" {
  name         = "${local.name}-web"
  user_pool_id = aws_cognito_user_pool.this.id

  generate_secret = false
  explicit_auth_flows = [
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
  ]
  # LEGACY: an email with no LeaveDesk account gets a clear "no account" error on sign-in and
  # "forgot password", instead of Cognito pretending a code was sent. Trade-off: someone could use
  # this to test which addresses have accounts; Cognito's request throttling limits that.
  prevent_user_existence_errors = "LEGACY"

  access_token_validity  = 1
  id_token_validity      = 1
  refresh_token_validity = 30

  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }
}

data "aws_iam_policy_document" "cognito_ses" {
  count = var.ses_identity_arn == "" ? 0 : 1

  statement {
    sid    = "AllowCognitoInviteMail"
    effect = "Allow"
    actions = [
      "ses:SendEmail",
      "ses:SendRawEmail",
    ]
    resources = [var.ses_identity_arn]

    principals {
      type        = "Service"
      identifiers = ["cognito-idp.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }

    condition {
      test     = "ArnLike"
      variable = "aws:SourceArn"
      values   = ["arn:aws:cognito-idp:${var.aws_region}:${data.aws_caller_identity.current.account_id}:userpool/*"]
    }
  }
}

resource "aws_ses_identity_policy" "cognito" {
  count    = var.ses_identity_arn == "" ? 0 : 1
  provider = aws.ses

  identity = local.ses_identity_name
  name     = "${local.name}-cognito"
  policy   = data.aws_iam_policy_document.cognito_ses[0].json
}
