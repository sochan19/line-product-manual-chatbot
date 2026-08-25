# PROGRESS — 進捗管理表

**更新ルール**: タスクの着手・完了・ブロック時に必ずこの表を更新する(CLAUDE.mdルール3)。
ステータス: `未着手` / `進行中` / `完了` / `ブロック中`

## 全体サマリ

| フェーズ | 内容 | ステータス | 完了日 |
|---|---|---|---|
| 環境構築 | アカウント・鍵・SSM・Terraform state基盤(`docs/env-setup-record.md`) | 完了 | 2026-08-18 |
| SDDコンテキスト整備 | CLAUDE.md・specs一式の作成 | 完了 | 2026-08-20 |
| [P0 骨格](p0-echo-bot/spec.md) | Terraform bootstrap+LINEエコーボット | 進行中 | |
| [P1 RAG MVP](p1-rag-mvp/spec.md) | AI Search連携+Haiku生成+出典表示 | 未着手 | |
| [P2 未回答判定+エスカレーション](p2-escalation/spec.md) | 二段判定・状態機械・SES・レート制限 | 未着手 | |
| [P3 マルチターン](p3-multi-turn/spec.md) | 会話履歴+クエリ書き換え | 未着手 | |
| [P4 運用整備](p4-operations/spec.md) | 同期維持・キャリブレーション・ドキュメント | 未着手 | |

## P0 骨格

| タスク | ステータス | メモ |
|---|---|---|
| オープン判断の決定(Terraform import方針 / stateロック方式 / エコーの経路) | 完了 | import採用/S3ネイティブロック/SQS+worker骨格を最初から作成。詳細はp0-echo-bot/spec.md参照 |
| モノレポ骨格(ポート&アダプタ、TypeScript基盤) | 完了 | pnpm workspaces / Vitest / Biome / dependency-cruiser。packages/domain・adapters、apps/webhook-lambda・worker-lambda |
| テスト基盤+CI(テストランナー・lint・GitHub Actions自動実行) | 完了 | `pnpm lint`/`typecheck`/`depcheck`/`test`が全てグリーン。`.github/workflows/ci.yml`をpush/PR毎に実行 |
| Terraform bootstrap(S3バックエンド+AWS/Cloudflareプロバイダ) | 完了 | `terraform init`/`validate`成功。ローカルapply済み(1 imported, 15 added) |
| GitHub Actions OIDC連携(IAMをTerraform管理) | 完了 | `infra/iam-oidc.tf`。subクレームのimmutable ID対応・読み取り権限不足を修正後、CDでのOIDC assume roleが成功することを確認済み |
| webhook Lambda(署名検証+エコー応答)+ユニットテスト | 完了 | `infra/lambda-webhook.tf`・`lambda-worker.tf`。ユニットテスト10件パス。実AWSへのデプロイ済み(Function URL: 下記参照) |
| Cloudflare R2バケットのimport | 完了 | `terraform plan -generate-config-out`で生成した設定をレビューし適用済み。AI Searchインスタンスはimport非対応と判明したため手動管理継続(env-setup-record §7-4) |
| ローカルでterraform apply(OIDCロール作成が必須の前提) | 完了 | 1 imported, 15 added, 1 changed。その後IAM権限修正2件も適用済み |
| CI(push毎にlint+test)/CD(mainへのpushでOIDC経由terraform apply) | 完了 | 両方ともGitHub Actions上でグリーン(run 32844206051・32844206157) |
| LINE Webhook URL設定・疎通確認 | 未着手 | Function URL: `https://xhzexecebtitzwiaz5zisl3jim0bwosw.lambda-url.ap-northeast-1.on.aws/`。LINE Developersコンソールでの設定とLINEアプリからの実疎通確認が残っている |

## P1 RAG MVP

| タスク | ステータス | メモ |
|---|---|---|
| SQS+DLQ+worker Lambda+冪等化 | 未着手 | |
| AI Search `/search` 呼び出し(messages形式) | 未着手 | |
| Haiku生成(チャンクのみ・ツールなし) | 未着手 | |
| 出典表示フォールバック(F-02) | 未着手 | |
| ユニットテスト(出典フォールバック・レスポンスパース・冪等化・プロンプト組み立て) | 未着手 | ポートをモック化して実施 |
| マニュアルアップロード・索引化確認 | 未着手 | |
| レイテンシ・日本語検索精度の実測 | 未着手 | 結果を記録し、必要なら逃げ道を検討 |
| 見出しメタデータ取得可否の確認 | 未着手 | |

## P2 未回答判定+エスカレーション

| タスク | ステータス | メモ |
|---|---|---|
| 第1段: スコア閾値足切り(θ1暫定値) | 未着手 | |
| 第2段: JSON構造化出力+自己判定 | 未着手 | |
| DynamoDB状態機械(NORMAL/WAITING_EMAIL) | 未着手 | |
| SES送信+アドレス即時破棄 | 未着手 | |
| DLQ到達時のユーザー通知(push API) | 未着手 | |
| ユーザー単位レート制限(1日20件) | 未着手 | |
| ユニットテスト(状態機械の全遷移・形式判定・安全側フォールバック・足切り・レート制限) | 未着手 | このフェーズのテスト価値が最大 |

## P3 マルチターン

| タスク | ステータス | メモ |
|---|---|---|
| DynamoDB会話履歴(6ターン/TTL24h) | 未着手 | |
| クエリ書き換えステップ(query condensation) | 未着手 | |
| ユニットテスト(履歴の6ターン上限・書き換えの配線) | 未着手 | 書き換え品質は評価セット側で検証 |
| 文脈依存質問の評価(誤エスカレーションなし) | 未着手 | |

## P4 運用整備

| タスク | ステータス | メモ |
|---|---|---|
| EventBridge 14日ごとダミークエリ | 未着手 | |
| 評価セット作成(30問+10問)+θ1キャリブレーション | 未着手 | コマンド一発で再実行できる回帰テストとしてスクリプト化 |
| F-01回帰テスト | 未着手 | 評価セットに含める |
| README/ADR整備 | 未着手 | |
| 運用手順書(インデックスエラー確認・コスト監視・マニュアル更新フロー) | 未着手 | |
