# AI Searchインスタンス(line-manual-bot)はTerraform管理下に置かない。
#
# 理由: cloudflare_ai_search_instance リソースはTerraform importに未対応
# (プロバイダ公式ドキュメント: "This resource does not currently support terraform import")。
# importできない既存リソースをTerraformで新規作成すると削除→再作成になり、
# インデックス済みデータを失うため、あえて手動管理のまま据え置く。
#
# 設定変更が必要な場合はCloudflareダッシュボードから行う(docs/env-setup-record.md §2.2・§7-4)。
