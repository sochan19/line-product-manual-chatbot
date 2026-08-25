output "webhook_function_url" {
  description = "LINE DevelopersコンソールのWebhook URLに設定する値"
  value       = aws_lambda_function_url.webhook.function_url
}

output "incoming_message_queue_url" {
  value = aws_sqs_queue.incoming_message.url
}

output "incoming_message_dlq_url" {
  value = aws_sqs_queue.incoming_message_dlq.url
}

output "webhook_idempotency_table_name" {
  value = aws_dynamodb_table.webhook_idempotency.name
}

output "github_actions_deploy_role_arn" {
  description = "cd.ymlがOIDCで引き受けるIAMロールARN"
  value       = aws_iam_role.github_actions_deploy.arn
}
