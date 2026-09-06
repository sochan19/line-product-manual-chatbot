# CLAUDE.md — line-product-manual-chatbot 常駐コンテキスト

## プロジェクト概要

マニュアル(Markdown `.md`)を**唯一の情報源**として、LINEで届いた質問に自動回答するQAボット。
マニュアルで答えられない質問は、ユーザーからメールアドレスを聞き取り、固定1名の担当者へSESでメール転送する(自動返信はしない)。

- 利用規模: 月10ユーザー・月50質問程度。予算: **月額¥2,000以内**(試算は約¥50〜100)
- 日本語のみ。認証なし(LINE友だち登録のみ)
- 実務の課題解決とポートフォリオの両立が目的。「コストと利便性のバランス」を判断基準とする

## アーキテクチャ(案F: AWS + Cloudflare ハイブリッド)

```
LINEユーザー → LINE Platform
  → [AWS] webhook Lambda(Function URL / 署名検証・冪等化・即200)
  → SQS(+DLQ)
  → worker Lambda
       1. DynamoDBから会話状態を取得
       2. Cloudflare AI Search /search をREST APIで直接呼び出し(検索)
       3. スコア閾値判定(第1段)
       4. Claude Haiku 4.5で生成+JSONで回答可能性を自己判定(第2段)
       5. LINE返信 / 未回答ならエスカレーション(SESで担当者へメール)

[Cloudflare] R2バケット line-manual-bot-manuals の manuals/ に.mdを置くだけで、
AI Searchがチャンク分割・埋め込み・索引化を全自動で実施(実装コードゼロ)
※ フォルダ名は manuals/(複数形)。単数形だとAI Searchが1件も認識しない
```

- **役割分担**: Cloudflare = マニュアルの索引化・検索のみ。AWS = それ以外すべて(Webhook・非同期処理・状態管理・メール)。Cloudflare Workers/Queuesは**使わない**(固定費回避が案F採用の核心)
- **リポジトリ構成**: モノレポ(アプリとインフラを1リポジトリで管理)+**ポート&アダプタ(ports-and-adapters)**: 業務ルール(ドメイン層)を中心に置き、AWS/LINE/Cloudflareへのアクセスはinterface(ポート)経由にして実装(アダプタ)を差し替え可能にする。外部サービスの乗り換えに強く、モックに差し替えてテストしやすい
- **技術スタック**: TypeScript / Terraform(AWS + Cloudflareの2プロバイダ)/ GitHub Actions(AWSはOIDC連携、CloudflareトークンはGitHub Secrets)
- **秘密管理**: SSM Parameter Store `/line-manual-bot/*`(登録済み一覧は `docs/env-setup-record.md` §5)

### 実装時の重要な注意点

- AI Searchの検索は `POST https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/**autorag/rags**/{NAME}/search`、ボディは `{"query": "質問文"}`。製品名は「AI Search」だが**検索系APIのパスは旧名の`autorag/rags`のまま**で、新しい`ai-search/instances`配下には存在せず401(ルート不在)になる。`messages`形式を送ると400。APIトークンは「AI Search: **編集**」権限が必要(実測の詳細は`docs/env-setup-record.md` §7)
- F-01(マニュアルのみを根拠)はアーキテクチャで担保する: LLMにツールを与えず、プロンプトには検索ヒットチャンクのみを入れる
- 迷ったら安全側 = **エスカレーションに倒す**(JSONパース失敗・タイムアウト・API障害はすべて未回答扱い)

## ドキュメントマップ

| ファイル | 役割 |
|---|---|
| `docs/design-v5-hybrid.md` | **設計の正**(Single Source of Truth)。要件・比較検討・アーキテクチャ・リスク |
| `docs/env-setup-record.md` | 環境構築の完了記録。作成済みリソース・SSMパラメータ・設計書からの訂正事項 |
| `specs/p0〜p4-*/spec.md` | フェーズごとの実装スペック(要件・完了条件・設計判断の抜粋) |
| `specs/PROGRESS.md` | フェーズ/タスクごとの進捗管理表 |
| `docs/glossary.md` | 用語集。ドキュメント内の専門用語は初出時にここへリンクするか短い説明を添える |

## 開発ルール(必ず守る)

1. **SDD(Spec-Driven Development)で進める**: 実装前に該当フェーズの `specs/*/spec.md` を確認し、**Plan Modeで計画を提示して承認を得てから**着手する。
2. **仕様変更はドキュメントが先**: 仕様変更が出たら、コードより先に `docs/design-v5-hybrid.md` と該当specを修正し、両者の整合性を確認してから実装に反映する。
3. **テストはspecとセットで書く**: 各specの「テスト」項を実装と同時に満たす。完了条件はできる限り自動テスト(ユニットテスト+評価セット)に落とし込み、CIで毎push実行する。実APIが絡む部分はポートをモックに差し替えてロジックを検証し、実APIとの結合は手動確認タスクとして分ける。
4. **PROGRESS.mdを常に最新に保つ**: タスクの着手・完了・ブロック時に `specs/PROGRESS.md` を更新する。
5. **命名**: 変数名・ファイル名にマジックナンバーを使わない。中学英語レベルのシンプルで意味の分かる名前にする(例: `dailyQuestionLimit`、`searchScoreThreshold`)。
6. **コメント**: 「何のためのコードか」を簡潔に書く。全行ではなく重要な箇所のみ。
7. **専門用語はやさしく**: ドキュメントを書く・更新する際、専門用語には短い説明を添えるか `docs/glossary.md` に追記してリンクする(読者はAWS/Terraform初心者の前提)。
8. **判断に迷う点は進める前にユーザーへ確認する**。
9. **フェーズ完了前にエラーハンドリングをレビューする**: `specs/*/spec.md` の完了条件にチェックを入れる前、`specs/PROGRESS.md` のステータスを「完了」にする前に、Skill `phase-error-review`(`.claude/skills/phase-error-review/SKILL.md`)を実行し、そのフェーズで実装・変更した処理でエラーが発生した際に意図しない挙動(サイレント失敗・イベント消失・重複処理・二重返信・F-01違反の幻覚回答など)にならないかを確認する。問題が見つかった場合は、完了条件をチェックする前にユーザーへ確認のうえ修正する。
