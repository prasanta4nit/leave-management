output "app_url" {
  description = "LeaveDesk web app"
  value       = "https://${aws_cloudfront_distribution.web.domain_name}"
}

output "api_url" {
  description = "Direct API Gateway URL"
  value       = aws_apigatewayv2_api.http.api_endpoint
}

output "frontend_bucket_name" {
  value = aws_s3_bucket.frontend.id
}

output "distribution_id" {
  value = aws_cloudfront_distribution.web.id
}

output "user_pool_id" {
  value = aws_cognito_user_pool.this.id
}

output "user_pool_client_id" {
  value = aws_cognito_user_pool_client.web.id
}

output "lambda_function_name" {
  value = aws_lambda_function.api.function_name
}

output "region" {
  value = data.aws_region.current.name
}
