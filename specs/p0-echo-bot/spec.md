# P0 骨格: LINEエコーボット + Terraform基盤

**元資料**: `docs/design-v5-hybrid.md` §8(P0)、§3.1〜3.3 / `docs/env-setup-record.md` §6・§8
**用語**: 分からない用語は `docs/glossary.md` を参照

## ゴール

LINEで送った文字がそのまま返る(完了条件)。あわせて、以降のフェーズが乗るモノレポ骨格とTerraform基盤を確立する。

## スコープ

1. **モノレポ骨格の作成**(ポート&アダプタ構成)
   - ドメイン層をAWS/LINE/Cloudflare非依存に保つディレクトリ構成
   - TypeScript・テスト・lint等の開発基盤セットアップ
2. **Terraform bootstrap**
   - S3バックエンド設定(state用バケットは作成済み: バージョニング+AES256有効)
   - AWSプロバイダ + Cloudflareプロバイダの追加
   - GitHub Actions → AWSのOIDC連携(IAM IDプロバイダー・ロールをTerraformで作成)
3. **webhook Lambda(Function URL公開)+ SQS + worker Lambda**
   - LINE署名検証(Channel Secret: SSM `/line-manual-bot/line/channel-secret`)
   - 冪等性チェック用DynamoDBテーブル(`webhookEventId`への条件付き書き込みのみ。ユーザー単位の会話状態テーブルとは別・P2で拡張しない)
   - SQS(+DLQ)への投入・即時200応答
   - worker LambdaがSQSをトリガーに受信テキストをそのまま返信するエコー応答(LINE返信APIはChannel Access Token: SSM `/line-manual-bot/line/channel-access-token`)
4. **LINE Developersコンソールで Webhook URL を設定**(Function URL払い出し後、手動)

## 関連する設計判断(抜粋)

- **Webhook受信はLambda Function URL**: API Gatewayの認可機能を使わないため、Gatewayを挟む合理的理由がない(§4)
- **webhook Lambdaの責務**: 署名検証・冪等性確保・SQS投入・即時200応答(§3.2)。本格的な非同期化(SQS+worker)はP1以降だが、P0の時点で構成をどこまで作るかは計画時に決める
- **LINE Webhook再送は既定で無効**であり、本設計では有効化しない(§3.3)
- Cloudflare側リソース(R2バケット `line-manual-bot-manuals`、AI Searchインスタンス `line-manual-bot`)は手動作成済み(env-setup-record §2)。R2バケットはP0でTerraform importする。AI Searchインスタンスは`cloudflare_ai_search_instance`がTerraform import未対応のため引き続き手動管理(env-setup-record §7-4)

## P0着手時に決めるオープン判断(env-setup-record §8)

- [x] 手動作成済みのR2バケット・AI SearchインスタンスをTerraformにimportするか、手動管理として割り切るか
  → **importする**方針としたが、実装時に判明: `cloudflare_ai_search_instance`リソースはTerraform importに対応していない(プロバイダ公式ドキュメントに明記)。そのためR2バケットのみimportし、AI Searchインスタンスは引き続き手動管理とする(env-setup-record.md §7に訂正事項として追記)。
- [x] Terraformバージョン確認の上、S3ネイティブロック(1.10+)を使うか、DynamoDBロックテーブルを追加するか
  → **S3ネイティブロック**を使う(ローカル確認: Terraform v1.15.8。`versions.tf`で`>= 1.10`を必須化し、CI側のTerraformバージョンも合わせる)。DynamoDBロックテーブルは作成しない。
- [x] エコー応答を webhook Lambda 直接返信にするか、最初から SQS + worker 経由の骨格を作るか
  → **SQS + worker Lambda経由の骨格をP0から作る**。design-v5-hybrid.mdの本来のアーキテクチャ(即200応答+非同期処理)に最初から沿い、P1のworker Lambda実装がそのまま乗る形にする。

## テスト

このフェーズでテスト基盤そのものを立ち上げる(テストランナー・lint・CIをここで整備し、以降のフェーズはそこに載せていく)。

- [x] 署名検証のユニットテスト: 正しい署名のリクエストを通し、署名が不正・欠落のリクエストを拒否する
- [x] エコー応答ロジックのユニットテスト(受信テキスト→返信メッセージの組み立て)
- [x] GitHub Actionsで push ごとに lint+ユニットテストが自動実行される(CI)

## 完了条件

- [ ] LINEでボットにテキストを送ると、同じ文字がそのまま返ってくる(手動確認)
- [x] Terraform apply がS3バックエンド+2プロバイダ構成で通る
- [x] GitHub ActionsからOIDCでAWSにデプロイできる
- [x] CIでlint+ユニットテストが通っている

## スコープ外

- AI Search呼び出し・LLM生成(→P1)
- ユーザー単位の会話状態(状態機械)・エスカレーション用DynamoDB(→P2)。P0で作るのはSQSメッセージの冪等性チェック専用テーブルのみで、会話状態とは別物。
