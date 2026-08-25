# P1で実測するまでの暫定値(specs/p0-echo-bot/spec.md参照)
locals {
  workerLambdaTimeoutSeconds    = 30
  queueVisibilityTimeoutSeconds = 180 # workerタイムアウトの約6倍(AWSの標準的な目安)
  maxReceiveCountBeforeDlq      = 3
  dlqMessageRetentionSeconds    = 60 * 60 * 24 * 14 # 14日
}

resource "aws_sqs_queue" "incoming_message_dlq" {
  name                      = "${var.project_name}-incoming-message-dlq"
  message_retention_seconds = local.dlqMessageRetentionSeconds
}

resource "aws_sqs_queue" "incoming_message" {
  name                       = "${var.project_name}-incoming-message"
  visibility_timeout_seconds = local.queueVisibilityTimeoutSeconds

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.incoming_message_dlq.arn
    maxReceiveCount     = local.maxReceiveCountBeforeDlq
  })
}

resource "aws_sqs_queue_redrive_allow_policy" "incoming_message_dlq" {
  queue_url = aws_sqs_queue.incoming_message_dlq.id

  redrive_allow_policy = jsonencode({
    redrivePermission = "byQueue"
    sourceQueueArns   = [aws_sqs_queue.incoming_message.arn]
  })
}
