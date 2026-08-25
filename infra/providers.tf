provider "aws" {
  region = var.aws_region
}

# CLOUDFLARE_API_TOKEN 環境変数からトークンを読む(tfファイル・tfvarsには書かない)
provider "cloudflare" {}

data "aws_ssm_parameter" "cloudflare_account_id" {
  name = "/line-manual-bot/cloudflare/account-id"
}
