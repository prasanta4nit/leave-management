resource "aws_apigatewayv2_api" "http" {
  name          = local.name
  protocol_type = "HTTP"
  description   = "Employee Desk API"

  cors_configuration {
    # Production traffic is same-origin through CloudFront. This list is for local dev.
    allow_origins  = ["http://localhost:5173"]
    allow_headers  = ["Authorization", "Content-Type"]
    allow_methods  = ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
    expose_headers = ["Content-Disposition"]
  }
}

resource "aws_apigatewayv2_integration" "lambda" {
  api_id                 = aws_apigatewayv2_api.http.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api.invoke_arn
  payload_format_version = "2.0"
  timeout_milliseconds   = 30000
}

resource "aws_apigatewayv2_route" "api" {
  api_id    = aws_apigatewayv2_api.http.id
  route_key = "ANY /api/{proxy+}"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.http.id
  name        = "$default"
  auto_deploy = true

  depends_on = [aws_apigatewayv2_route.api]
}

resource "aws_lambda_permission" "apigateway" {
  statement_id  = "AllowHttpApi"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http.execution_arn}/*/*"
}
