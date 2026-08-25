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

# authorization_type = "NONE" にしただけでは匿名呼び出しは許可されない。
# Function URLを誰でも呼び出せるようにするリソースベースポリシーを別途付与する必要がある。
# 2025年10月以降、AWSはlambda:InvokeFunctionUrlに加えてlambda:InvokeFunctionも
# 必須にした(片方だけでは403 Forbiddenになる)。
resource "aws_lambda_permission" "webhook_function_url_public" {
  statement_id           = "AllowPublicInvokeFunctionUrl"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.webhook.function_name
  principal              = "*"
  function_url_auth_type = "NONE"
}

# 本来は invoked_via_function_url = true で「Function URL経由のみ」に絞りたいが、
# この引数はAWSプロバイダ6系で追加されたばかりで、versions.tfで固定している5系には
# まだ存在しない(実装時点で確認済み)。制限なしの公開許可になるが、このLambda自体が
# LINEのHMAC署名を検証するため実害は小さい。プロバイダを6系に上げる際に絞り込むこと。
resource "aws_lambda_permission" "webhook_function_url_invoke" {
  statement_id  = "AllowPublicInvokeFunction"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.webhook.function_name
  principal     = "*"
}
