# PROGRESS — 進捗管理表

**更新ルール**: タスクの着手・完了・ブロック時に必ずこの表を更新する(CLAUDE.mdルール3)。
ステータス: `未着手` / `進行中` / `完了` / `ブロック中`

## 全体サマリ

| フェーズ | 内容 | ステータス | 完了日 |
|---|---|---|---|
| 環境構築 | アカウント・鍵・SSM・Terraform state基盤(`docs/env-setup-record.md`) | 完了 | 2026-08-18 |
| SDDコンテキスト整備 | CLAUDE.md・specs一式の作成 | 完了 | 2026-08-20 |
| [P0 骨格](p0-echo-bot/spec.md) | Terraform bootstrap+LINEエコーボット | 完了 | 2026-08-25 |
| [P1 RAG MVP](p1-rag-mvp/spec.md) | AI Search連携+Haiku生成+出典表示 | 進行中 | |
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
| LINE Webhook URL設定・疎通確認 | 完了 | Function URL: `https://xhzexecebtitzwiaz5zisl3jim0bwosw.lambda-url.ap-northeast-1.on.aws/`。実機でのエコー確認済み。途中、Function URLの公開許可に`lambda:InvokeFunction`権限が漏れており403 Forbiddenになる不具合があったため修正した(2025年10月以降のAWS仕様変更) |
| コードレビューで見つかった2件のバグ修正 | 完了 | ①SSM取得失敗時にウォームスタートしたLambdaが以後同じエラーを返し続けるキャッシュのバグ(`handler.ts`)、②webhookループで1件のイベント処理失敗が他のイベントを巻き込んで止まる問題(`webhookHandler.ts`。1件失敗時は500系を返すよう変更)。冪等性claim済みレコードの明示的な取り消しは行わずTTL任せとした(YAGNI) |

## P1 RAG MVP

| タスク | ステータス | メモ |
|---|---|---|
| P1の設計判断の確定(出典の生成主体・エラー時の挙動)とドキュメント反映 | 完了 | 出典はコード側で組み立て(設計書§3.4を修正)。検索・生成失敗時は定型返信してから例外を投げDLQへ |
| SQS+DLQ+worker Lambda+冪等化 | 完了 | P0で前倒し実装済み(`infra/sqs.tf`・`lambda-worker.tf`、冪等化はwebhook側の`dynamoIdempotencyGuard`) |
| AI Search `/search` 呼び出し | 完了 | `packages/adapters/src/cloudflare/`。レスポンスのパースは純関数に切り出し、2系統の返却形に対応。**2026-09-06にエンドポイントとボディを訂正**: `ai-search/instances/{名前}/search` + `messages`形式は誤りで、正しくは `autorag/rags/{名前}/search` + `{"query": "..."}`。誤ったままでは本番の全質問が401になる状態だった(実測マトリクスはenv-setup-record §7-1) |
| Haiku生成(チャンクのみ・ツールなし) | 完了 | `packages/adapters/src/anthropic/haikuAnswerGenerator.ts`。モデルID `claude-haiku-4-5`、ツール未指定をテストで固定 |
| 出典表示フォールバック(F-02) | 完了 | `packages/domain/src/answer/formatSources.ts`。先頭3行以内の`#`〜`###`を見出しとして採用 |
| ユニットテスト(出典フォールバック・レスポンスパース・冪等化・プロンプト組み立て) | 完了 | 全52件パス。worker全体の配線もモックで検証。追加分: SSMパラメータ4件の読み取り・生成の時間予算・検索のタイムアウト/非JSON応答・ヒット0件時の返信失敗 |
| エラーハンドリングレビュー(Skill `phase-error-review`) | 完了 | 2026-09-06実施。①worker `handler.test.ts` が環境変数不足で失敗しCIが赤だったのを修正、②Anthropic SDKの既定リトライ(2回)によりLambdaの30秒タイムアウトを超え、catch節に入れずユーザーが無応答になる経路を `maxRetries: 0` で解消。握りつぶし・幻覚経路はなし。残課題2点(LINE返信にタイムアウトがない/設計判断3点)は下記とp2-escalation/spec.md §1-2へ。**その後の変更(エンドポイント訂正・チャンク展開・時間予算引き上げ)も同じ観点で再確認済み**: `content[]`から本文を1件も取り出せない場合は結合結果を空にせず例外にし、検索失敗・パース不能はすべて定型返信+DLQへ流れる(誤った回答の材料にしない) |
| マニュアルアップロード・索引化確認 | 完了 | `manuals/hallman-at5-mizusumashi-series-manual.md`(17.3KB)を索引化し、検索でヒットすることを確認(2026-09-06)。途中、**パスが `manual/`(単数)で対象指定 `manuals/*` と一致せず、同期が正常終了しつつ `0 files seen`** という無警告の失敗を踏んだ(設計書§3.6・§6に追記)。形式は`.md`で確定。同期の手動起動は `POST /accounts/{acct}/ai-search/instances/{名前}/jobs` |
| レイテンシ・日本語検索精度の実測 | 完了 | **レイテンシ: 630 / 4,253 / 4,679 / 5,778 / 8,708 ms(中央4,679・最大8,708)**。最大値が検索タイムアウト10秒に迫っていたため、**Lambda 30→60秒 / 検索 10→15秒 / 生成 15→20秒**に引き上げた。**精度: 関連質問4/4で正しいセクションが1位(スコア0.52〜0.62)、マニュアルに無い質問はヒット0件**。§4の逃げ道(ハイブリッド検索・埋め込みモデル差し替え)は不要と判断 |
| 見出しメタデータ取得可否の確認 | 完了 | `attributes` に見出しは**含まれない**(`timestamp`/`folder`/空の`filename`/`file`のみ)。→ **本文から抽出するF-02フォールバックは必須**と確定。実測4件すべてで正しい見出しを抽出できている |
| レスポンス構造の実測対応(チャンク展開) | 完了 | `data[]`が**ファイル単位**で`content[]`に複数チャンクが入ると判明。結合したままだとチャンクごとのスコアが失われP2の足切りができないため、`parseAiSearchResponse`で1チャンク=1`ManualChunk`に展開。実APIで検索→プロンプト組み立て→出典組み立てまで通しで確認済み |
| 実機確認(LINEで出典付き回答が返る) | 未着手 | mainへのマージでCDがデプロイした後に実施。**`infra/sqs.tf`のタイムアウト変更があるため`terraform apply`が必要** |
| LINE返信のタイムアウト未設定(P0からの持ち越し) | 未着手 | `lineReplySender.ts`。`@line/bot-sdk` 9.9.0の`MessagingApiClient`はtimeoutオプションを持たず内部fetchにも期限がない。LINE APIが無応答だとLambdaタイムアウトまで待ち、ユーザーが無応答になる。直すには独自fetchかラップが必要 |

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
