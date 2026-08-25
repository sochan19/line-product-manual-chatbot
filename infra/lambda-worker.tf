data "archive_file" "worker" {
  type        = "zip"
  source_dir  = "${path.module}/../apps/worker-lambda/dist"
  output_path = "${path.module}/../apps/worker-lambda/dist.zip"
}

data "aws_iam_policy_document" "worker_lambda_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "worker_lambda" {
  name               = "${var.project_name}-worker-lambda"
  assume_role_policy = data.aws_iam_policy_document.worker_lambda_trust.json
}

# 冪等性チェックはwebhook Lambda側でのみ行うため、worker LambdaはDynamoDBへのアクセスを持たない
data "aws_iam_policy_document" "worker_lambda_permissions" {
  statement {
    sid       = "WriteLogs"
    effect    = "Allow"
    actions   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["arn:aws:logs:${var.aws_region}:*:log-group:/aws/lambda/${var.project_name}-worker*"]
  }

  statement {
    sid    = "ConsumeIncomingMessage"
    effect = "Allow"
    actions = [
      "sqs:ReceiveMessage",
      "sqs:DeleteMessage",
      "sqs:GetQueueAttributes",
    ]
    resources = [aws_sqs_queue.incoming_message.arn]
  }

  statement {
    sid       = "ReadChannelAccessToken"
    effect    = "Allow"
    actions   = ["ssm:GetParameter"]
    resources = ["arn:aws:ssm:${var.aws_region}:*:parameter/line-manual-bot/line/channel-access-token"]
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

resource "aws_iam_role_policy" "worker_lambda" {
  name   = "${var.project_name}-worker-lambda"
  role   = aws_iam_role.worker_lambda.id
  policy = data.aws_iam_policy_document.worker_lambda_permissions.json
}

resource "aws_lambda_function" "worker" {
  function_name    = "${var.project_name}-worker"
  role             = aws_iam_role.worker_lambda.arn
  handler          = "index.handler"
  runtime          = "nodejs22.x"
  timeout          = local.workerLambdaTimeoutSeconds
  filename         = data.archive_file.worker.output_path
  source_code_hash = data.archive_file.worker.output_base64sha256

  environment {
    variables = {
      LINE_CHANNEL_ACCESS_TOKEN_PARAMETER_NAME = "/line-manual-bot/line/channel-access-token"
    }
  }
}

resource "aws_lambda_event_source_mapping" "worker" {
  event_source_arn = aws_sqs_queue.incoming_message.arn
  function_name    = aws_lambda_function.worker.function_name
  batch_size       = 1
}
