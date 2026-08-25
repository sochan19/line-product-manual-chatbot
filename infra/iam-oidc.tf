data "tls_certificate" "github_actions" {
  url = "https://token.actions.githubusercontent.com/.well-known/openid-configuration"
}

resource "aws_iam_openid_connect_provider" "github_actions" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [data.tls_certificate.github_actions.certificates[0].sha1_fingerprint]
}

data "aws_iam_policy_document" "github_actions_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github_actions.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      # GitHubはリポジトリ名変更を追跡するため、組織名・リポジトリ名それぞれの後ろに
      # 数値の内部ID(例: sochan19@51894375)を付与したsubクレームを発行する。
      # そのためワイルドカードで数値ID部分を許容する。
      values = ["repo:${split("/", var.github_repository)[0]}@*/${split("/", var.github_repository)[1]}@*:ref:refs/heads/main"]
    }
  }
}

resource "aws_iam_role" "github_actions_deploy" {
  name               = "${var.project_name}-github-actions-deploy"
  assume_role_policy = data.aws_iam_policy_document.github_actions_trust.json
}

# terraform apply が必要とする範囲に絞ったデプロイ権限。
# List/Describe系は読み取り専用のため広め、作成・変更・削除系はこのプロジェクトのリソースに絞る。
data "aws_iam_policy_document" "github_actions_deploy" {
  statement {
    sid    = "ReadOnlyDescribe"
    effect = "Allow"
    actions = [
      "lambda:GetFunction*",
      "lambda:ListFunctions",
      "iam:GetRole",
      "iam:GetRolePolicy",
      "iam:ListRolePolicies",
      "iam:ListAttachedRolePolicies",
      "iam:ListInstanceProfilesForRole",
      "sqs:GetQueueAttributes",
      "sqs:GetQueueUrl",
      "dynamodb:DescribeTable",
      "ssm:GetParameter",
      "ssm:GetParameters",
      "s3:GetObject",
      "s3:PutObject",
      "s3:ListBucket",
    ]
    resources = ["*"]
  }

  statement {
    sid    = "ManageProjectResources"
    effect = "Allow"
    actions = [
      "lambda:CreateFunction",
      "lambda:UpdateFunctionCode",
      "lambda:UpdateFunctionConfiguration",
      "lambda:DeleteFunction",
      "lambda:AddPermission",
      "lambda:RemovePermission",
      "lambda:CreateFunctionUrlConfig",
      "lambda:UpdateFunctionUrlConfig",
      "lambda:DeleteFunctionUrlConfig",
      "lambda:GetFunctionUrlConfig",
      "lambda:TagResource",
      "lambda:UntagResource",
      "lambda:CreateEventSourceMapping",
      "lambda:UpdateEventSourceMapping",
      "lambda:DeleteEventSourceMapping",
      "lambda:GetEventSourceMapping",
      "sqs:CreateQueue",
      "sqs:DeleteQueue",
      "sqs:SetQueueAttributes",
      "sqs:TagQueue",
      "dynamodb:CreateTable",
      "dynamodb:DeleteTable",
      "dynamodb:UpdateTable",
      "dynamodb:UpdateTimeToLive",
      "dynamodb:DescribeTimeToLive",
      "dynamodb:TagResource",
      "logs:CreateLogGroup",
      "logs:DeleteLogGroup",
      "logs:PutRetentionPolicy",
      "logs:DescribeLogGroups",
      "logs:TagResource",
    ]
    resources = ["*"]
  }

  statement {
    sid    = "ManageLambdaExecutionRoles"
    effect = "Allow"
    actions = [
      "iam:CreateRole",
      "iam:DeleteRole",
      "iam:TagRole",
      "iam:PutRolePolicy",
      "iam:DeleteRolePolicy",
      "iam:AttachRolePolicy",
      "iam:DetachRolePolicy",
      "iam:PassRole",
    ]
    resources = ["arn:aws:iam::*:role/${var.project_name}-*"]
  }
}

resource "aws_iam_role_policy" "github_actions_deploy" {
  name   = "${var.project_name}-github-actions-deploy"
  role   = aws_iam_role.github_actions_deploy.id
  policy = data.aws_iam_policy_document.github_actions_deploy.json
}
