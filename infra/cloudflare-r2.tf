# 手動作成済みのR2バケットをTerraform管理下に置く。
# 手順(ローカルでCLOUDFLARE_API_TOKENを設定した上で実行する。CIでは実行しない):
#   1. terraform init
#   2. terraform plan -generate-config-out=generated.tf
#   3. generated.tf の内容(jurisdiction/location/storage_class等)を人手でレビューし、
#      このファイルへ resource "cloudflare_r2_bucket" "manuals" { ... } として統合する
#   4. terraform plan で差分ゼロになることを確認してから terraform apply
import {
  to = cloudflare_r2_bucket.manuals
  id = "${data.aws_ssm_parameter.cloudflare_account_id.value}/line-manual-bot-manuals"
}

resource "cloudflare_r2_bucket" "manuals" {
  account_id = data.aws_ssm_parameter.cloudflare_account_id.value
  name       = "line-manual-bot-manuals"
  location   = "APAC"
}
