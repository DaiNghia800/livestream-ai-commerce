output "ecr_urls" {
  value = { for k, r in aws_ecr_repository.svc : k => r.repository_url }
}

output "execution_role_arn" {
  value = aws_iam_role.execution.arn
}

output "commerce_task_role_arn" {
  value = aws_iam_role.commerce_task.arn
}

output "realtime_task_role_arn" {
  value = aws_iam_role.realtime_task.arn
}

output "commerce_secret_arns" {
  value = {
    SECRET_KEY          = aws_ssm_parameter.secret_key.arn
    MOCK_GATEWAY_SECRET = aws_ssm_parameter.mock_gateway.arn
    MOCK_CARRIER_SECRET = aws_ssm_parameter.mock_carrier.arn
  }
}