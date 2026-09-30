data "aws_iam_policy_document" "scheduler_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["scheduler.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "scheduler" {
  name               = "${local.name}-scheduler"
  assume_role_policy = data.aws_iam_policy_document.scheduler_assume.json
}

data "aws_iam_policy_document" "scheduler_invoke" {
  statement {
    effect    = "Allow"
    actions   = ["lambda:InvokeFunction"]
    resources = [aws_lambda_function.api.arn]
  }
}

resource "aws_iam_role_policy" "scheduler_invoke" {
  name   = "${local.name}-scheduler"
  role   = aws_iam_role.scheduler.id
  policy = data.aws_iam_policy_document.scheduler_invoke.json
}

resource "aws_lambda_permission" "scheduler" {
  statement_id   = "AllowEventBridgeScheduler"
  action         = "lambda:InvokeFunction"
  function_name  = aws_lambda_function.api.function_name
  principal      = "scheduler.amazonaws.com"
  source_account = data.aws_caller_identity.current.account_id
}

resource "aws_scheduler_schedule" "accrual" {
  name                         = "${local.name}-accrual"
  description                  = "Create missing balances and credit monthly or quarterly accrual"
  schedule_expression          = "cron(15 0 * * ? *)"
  schedule_expression_timezone = var.timezone

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = aws_lambda_function.api.arn
    role_arn = aws_iam_role.scheduler.arn
    input    = jsonencode({ job = "accrual" })
  }
}

resource "aws_scheduler_schedule" "reminders" {
  name                         = "${local.name}-reminders"
  description                  = "Email approvers about requests pending too long"
  schedule_expression          = "cron(30 9 ? * MON-FRI *)"
  schedule_expression_timezone = var.timezone

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = aws_lambda_function.api.arn
    role_arn = aws_iam_role.scheduler.arn
    input    = jsonencode({ job = "reminders" })
  }
}

resource "aws_scheduler_schedule" "year_end" {
  name                         = "${local.name}-year-end"
  description                  = "Carry unused leave forward on 1 January"
  schedule_expression          = "cron(30 0 1 1 ? *)"
  schedule_expression_timezone = var.timezone

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = aws_lambda_function.api.arn
    role_arn = aws_iam_role.scheduler.arn
    input    = jsonencode({ job = "year-end" })
  }
}
