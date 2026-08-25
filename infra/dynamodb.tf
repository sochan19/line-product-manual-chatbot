# webhook Lambdaが受信したLINEイベントの冪等性チェック専用テーブル。
# ユーザー単位の会話状態(P2)とは別テーブル(理由はspecs/p0-echo-bot/spec.md参照)。
resource "aws_dynamodb_table" "webhook_idempotency" {
  name         = "${var.project_name}-webhook-idempotency"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "webhookEventId"

  attribute {
    name = "webhookEventId"
    type = "S"
  }

  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }
}
