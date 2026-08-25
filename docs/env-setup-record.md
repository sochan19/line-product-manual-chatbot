# LINE Wordマニュアル参照QAボット 環境構築完了記録

**作成日**: 2026-08-18
**対応する設計書**: `LINE-QAボット設計書_v5_ハイブリッド.md`(案F: AWS + Cloudflare ハイブリッド)
**本ドキュメントの目的**: P0(実装フェーズ)着手前に完了した環境構築の内容を記録し、Claude Codeセッション等で参照できるようにする。

---

## 1. 完了チェックリスト

| # | 項目 | 状態 |
|---|---|---|
| 1 | Cloudflareアカウント作成・R2有効化 | ✅ |
| 2 | R2バケット作成・AI Searchインスタンス作成 | ✅ |
| 3 | Cloudflare APIトークン発行(Lambda用・Terraform用) | ✅ |
| 4 | LINE Messaging API鍵取得(Channel ID・Channel Secret・チャネルアクセストークン) | ✅ |
| 5 | Anthropic APIキー発行・spend limit設定 | ✅ |
| 6 | AWS SSM Parameter Storeへの秘密情報登録 | ✅ |
| 7 | GitHubリポジトリ作成・ローカルクローン | ✅ |
| 8 | Terraform state用S3バケット作成(ブートストラップ) | ✅ |

**前提として完了済みだったもの**(本記録の対象外):
- AWSアカウント作成・IAM付与・CLI設定
- LINE Messaging APIのChannel ID取得
- Terraform CLI・AWS CLI・Claude Code CLIのローカルインストール

---

## 2. Cloudflare側リソース

### 2.1 R2バケット

| 項目 | 値 |
|---|---|
| バケット名 | `line-manual-bot-manuals` |
| 用途プレフィックス | `manuals/`(設計書§3.1の構成図と一致) |
| 作成方法 | ダッシュボードから手動作成(Terraform未管理) |

### 2.2 AI Searchインスタンス

| 項目 | 値 |
|---|---|
| インスタンス名 | `line-manual-bot` |
| 名前空間(namespace) | `default` |
| データソース | R2バケット `line-manual-bot-manuals` |
| パスフィルタ(インクルードルール) | `manuals/*` |
| チャンク分割・埋め込み設定 | スマートデフォルト(自動)のまま。P1で日本語検索精度を実測し、必要に応じて見直し |
| ハイブリッド検索 | オフ(精度不足時の「逃げ道」として温存、設計書§4参照) |
| クエリ書き換え(rewrite_query) | オフ(会話履歴を見ない単発最適化のため、マルチターン対応には使わない方針。設計書§3.4a参照) |
| 作成方法 | ダッシュボードから手動作成(Terraform未管理) |

**索引状況の注記**: 作成直後の時点で「Objects: 1」と表示されていたが、これはR2でフォルダ(`manuals/`)を作成した際に生成される空のプレースホルダーオブジェクトであることを確認済み。実害なし。

### 2.3 Cloudflare APIトークン

| トークン名 | 権限 | 用途 |
|---|---|---|
| `line-manual-bot-worker-search` | アカウント / AI Search / **編集** | worker LambdaからAI Searchの`/search`を呼び出す用。当初「読み取り」で作成したが、公式ドキュメントで`/search`呼び出しにはEdit権限が必要と判明し、編集権限に修正済み |
| `line-manual-bot-terraform` | アカウント / R2 / 編集、アカウント / AI Search / 編集 | Terraformのcloudflareプロバイダ認証用。ローカル環境変数`CLOUDFLARE_API_TOKEN`として設定する想定。**SSM未登録**(手動管理) |
| (自動生成トークン、名称「AI Search Token - 2026-08-17」) | アカウント / AI Search | AI Search自身がR2からファイルを読み込むための内部トークン。Cloudflare側が管理、触る必要なし |

### 2.4 Cloudflareアカウント情報

- Account ID: SSM Parameter Store `/line-manual-bot/cloudflare/account-id` に登録済み(String型、非暗号化)
- 確認方法: R2オブジェクトストレージ概要ページのS3互換エンドポイントURLから取得

---

## 3. LINE Messaging API

| 項目 | 状態 |
|---|---|
| Channel ID | 取得済み |
| Channel Secret | 取得済み、SSMに登録済み |
| チャネルアクセストークン(長期) | 取得済み、SSMに登録済み |
| Webhook URL | **未設定**。P0でLambda Function URLが払い出された後に設定する |

---

## 4. Anthropic API

- APIキー発行済み、SSMに登録済み
- Settings > Billing > Spend limits にて月額利用上限(spend limit)を設定済み
- 使用予定モデル: Claude Haiku 4.5(生成・クエリ書き換え用)

---

## 5. AWS SSM Parameter Store

リージョン: `ap-northeast-1`

| パラメータ名 | Type | 内容 |
|---|---|---|
| `/line-manual-bot/line/channel-secret` | SecureString | LINEチャネルシークレット |
| `/line-manual-bot/line/channel-access-token` | SecureString | LINEチャネルアクセストークン(長期) |
| `/line-manual-bot/anthropic/api-key` | SecureString | Anthropic APIキー |
| `/line-manual-bot/cloudflare/ai-search-token` | SecureString | Cloudflare APIトークン(Lambda用・AI Search編集権限) |
| `/line-manual-bot/cloudflare/account-id` | String | CloudflareアカウントID(非機密のため平文) |

確認コマンド:
```bash
aws ssm get-parameters-by-path \
  --path "/line-manual-bot" \
  --recursive \
  --region ap-northeast-1
```

**注記**: Cloudflare Terraform用トークン(`line-manual-bot-terraform`)は意図的にSSM未登録。Terraform実行時のみローカル環境変数`CLOUDFLARE_API_TOKEN`として渡す運用とする。

---

## 6. GitHub / Terraform基盤

- GitHubリポジトリ作成済み、ローカルにクローン済み(中身は空)
- Terraform state用S3バケット作成済み(バケット名は実際の作成名を参照、例: `line-manual-bot-tfstate`)
  - バージョニング: 有効化済み
  - サーバーサイド暗号化(AES256): 有効化済み
  - ロック機構: DynamoDBテーブルは作成していない。Terraform 1.10以降のS3ネイティブロックを使う想定(実装時にバージョン確認要)
- GitHub Actions → AWSの認証方式: **OIDC連携**を採用する方針(長期アクセスキー不使用)。IAM ID プロバイダー・ロールはTerraformでコード管理する予定(未作成)
- Cloudflare側はOIDC連携が一般的でないため、`CLOUDFLARE_API_TOKEN`は通常のGitHub Secretsで管理する方針

---

## 7. 設計書作成時点から判明した仕様変更・訂正事項

Cloudflare公式ドキュメントを最新確認した結果、設計書(2026-08-17時点)から以下の点が更新されていることが判明した。

1. **AI Search `/search` のリクエスト形式**: 単純な`query`文字列ではなく、OpenAI互換の`messages`配列形式が必要
   ```json
   {"messages": [{"role": "user", "content": "質問文"}]}
   ```
   エンドポイントURL自体(`https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai-search/instances/{NAME}/search`)は設計書の記載と一致することを確認済み。

2. **APIトークンの必要権限**: `/search`呼び出しには「AI Search: 編集」権限が必要(「読み取り」のみでは不十分)。

3. **データソース選択肢の追加**: ダッシュボードのインスタンス作成フローに「組み込みストレージ」(R2を介さずCloudflareが直接管理する専用ストレージ)という選択肢が新たに存在する。本プロジェクトでは設計書の運用フロー(運用者がR2にアップロード)を実現するため、引き続き**R2バケット**をデータソースとして選択している。

4. **AI SearchインスタンスはTerraform importに未対応**(P0実装時判明): Cloudflareプロバイダ公式ドキュメントに「This resource does not currently support terraform import」と明記されている。そのため、P0のオープン判断で「R2・AI Searchともにimportする」とした方針のうち、**R2バケット(`cloudflare_r2_bucket`)のみimportし、AI Searchインスタンス(`cloudflare_ai_search_instance`)は引き続き手動管理**とする。今後インスタンス設定を変更する場合はCloudflareダッシュボードから行う。

---

## 8. P0着手時にClaude Codeへ伝えるべき前提情報

次の実装セッションでは、本記録の内容(特に第2〜7章)をコンテキストとして渡すこと。特に以下の判断が未確定のため、セッション冒頭で方針を決める:

- R2バケット・AI Searchインスタンスは手動作成済み(Terraform未管理)。これをTerraformにimportするか、手動管理リソースとして割り切るかの方針決定が必要
- Terraformバージョンを確認した上で、S3ネイティブロック(1.10+)を使うか、DynamoDBロックテーブルを追加するかを決定

---

## 9. 未着手・今後の作業

- LINE Webhook URLの設定(P0でLambda作成後)
- Terraformへのcloudflareプロバイダ追加・S3バックエンド設定(Claude Codeで実施)
- GitHub ActionsのOIDC連携設定(IAM IDプロバイダー・ロール作成、Claude Codeで実施)
- P0(LINEエコーボット)以降の実装フェーズ全体
