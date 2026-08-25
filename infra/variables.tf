variable "aws_region" {
  description = "AWSリソースを作成するリージョン"
  type        = string
  default     = "ap-northeast-1"
}

variable "project_name" {
  description = "リソース名のプレフィックスに使う識別子"
  type        = string
  default     = "line-manual-bot"
}

variable "github_repository" {
  description = "GitHub Actions OIDCの信頼対象リポジトリ(owner/repo形式)"
  type        = string
  default     = "sochan19/line-product-manual-chatbot"
}
