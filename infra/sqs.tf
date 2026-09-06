# P1の実測(2026-09-06)を反映した値
locals {
  # 検索15秒 + 生成20秒 + LINE返信 の合計が収まる長さ。
  # AI Searchのレイテンシを実測したところ中央4.7秒・最大8.7秒だったため、
  # 検索10秒では余裕が1.3秒しかなかった(specs/p1-rag-mvp/spec.md 実測タスク)
  workerLambdaTimeoutSeconds    = 60
  queueVisibilityTimeoutSeconds = 180 # workerタイムアウトの3倍
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
