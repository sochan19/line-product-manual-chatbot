terraform {
  backend "s3" {
    bucket       = "line-manual-bot-tfstate"
    key          = "line-manual-bot/terraform.tfstate"
    region       = "ap-northeast-1"
    encrypt      = true
    use_lockfile = true
  }
}
