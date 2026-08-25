locals {
  webhookLambdaTimeoutSeconds = 10
}

data "archive_file" "webhook" {
  type        = "zip"
  source_dir  = "${path.module}/../apps/webhook-lambda/dist"
  output_path = "${path.module}/../apps/webhook-lambda/dist.zip"
}

data "aws_iam_policy_document" "webhook_lambda_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "webhook_lambda" {
  name               = "${var.project_name}-webhook-lambda"
  assume_role_policy = data.aws_iam_policy_document.webhook_lambda_trust.json
}

data "aws_iam_policy_document" "webhook_lambda_permissions" {
  statement {
    sid       = "WriteLogs"
    effect    = "Allow"
    actions   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["arn:aws:logs:${var.aws_region}:*:log-group:/aws/lambda/${var.project_name}-webhook*"]
  }

  statement {
    sid       = "ClaimIdempotencyRecord"
    effect    = "Allow"
    actions   = ["dynamodb:PutItem"]
    resources = [aws_dynamodb_table.webhook_idempotency.arn]
  }

  statement {
    sid       = "EnqueueIncomingMessage"
    effect    = "Allow"
    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.incoming_message.arn]
  }

  statement {
    sid       = "ReadChannelSecret"
    effect    = "Allow"
    actions   = ["ssm:GetParameter"]
    resources = ["arn:aws:ssm:${var.aws_region}:*:parameter/line-manual-bot/line/channel-secret"]
  }

  statement {
    sid       = "DecryptSecureStringParameter"
    effect    = "Allow"
    actions   = ["kms:Decrypt"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["ssm.${var.aws_region}.amazonaws.com"]
    }
  }
}

resource "aws_iam_role_policy" "webhook_lambda" {
  name   = "${var.project_name}-webhook-lambda"
  role   = aws_iam_role.webhook_lambda.id
  policy = data.aws_iam_policy_document.webhook_lambda_permissions.json
}

resource "aws_lambda_function" "webhook" {
  function_name    = "${var.project_name}-webhook"
  role             = aws_iam_role.webhook_lambda.arn
  handler          = "index.handler"
  runtime          = "nodejs22.x"
  timeout          = local.webhookLambdaTimeoutSeconds
  filename         = data.archive_file.webhook.output_path
  source_code_hash = data.archive_file.webhook.output_base64sha256

  environment {
    variables = {
      IDEMPOTENCY_TABLE_NAME             = aws_dynamodb_table.webhook_idempotency.name
      OUTBOUND_QUEUE_URL                 = aws_sqs_queue.incoming_message.url
      LINE_CHANNEL_SECRET_PARAMETER_NAME = "/line-manual-bot/line/channel-secret"
    }
  }
}

resource "aws_lambda_function_url" "webhook" {
  function_name      = aws_lambda_function.webhook.function_name
  authorization_type = "NONE" # LINEのHMAC署名検証が実質的な認証境界のため
}
