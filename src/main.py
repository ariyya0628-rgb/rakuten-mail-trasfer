import json
import sys
from pathlib import Path

from googleapiclient.errors import HttpError

from filters import delete_obsolete_filters, ensure_filters
from gmail_client import (
    CREDENTIALS_FILE,
    TOKEN_FILE,
    CredentialsFileNotFoundError,
    GmailAuthenticationError,
    get_gmail_service,
)
from labels import ensure_labels


PROJECT_ROOT = Path(__file__).resolve().parents[1]
FILTERS_CONFIG_FILE = PROJECT_ROOT / "config" / "filters.json"


def load_filter_config():
    with FILTERS_CONFIG_FILE.open("r", encoding="utf-8") as file:
        return json.load(file)


def print_label_result(result):
    if result["status"] == "OK":
        print(f"[OK] ラベル作成: {result['name']}")
    else:
        print(f"[SKIP] ラベル既存: {result['name']}")


def print_filter_result(result):
    if result["status"] == "OK":
        print(f"[OK] フィルタ作成: {result['criteria']}")
    else:
        print(f"[SKIP] フィルタ既存: {result['criteria']}")


def print_deleted_filter_result(result):
    if result["status"] == "OK":
        print(f"[OK] 旧フィルタ削除: {result['criteria']} ({result['count']}件)")
    else:
        print(f"[SKIP] 旧フィルタなし: {result['criteria']}")


def main():
    try:
        config = load_filter_config()
        service = get_gmail_service()

        label_ids, label_results = ensure_labels(service, config.get("labels", []))
        for result in label_results:
            print_label_result(result)

        deleted_filter_results = delete_obsolete_filters(
            service,
            config.get("obsolete_filters", []),
            label_ids,
        )
        for result in deleted_filter_results:
            print_deleted_filter_result(result)

        filter_results = ensure_filters(service, config.get("filters", []), label_ids)
        for result in filter_results:
            print_filter_result(result)

    except CredentialsFileNotFoundError:
        print("[ERROR] Google OAuth認証ファイルが見つかりません。")
        print(f"Google CloudからOAuthクライアントJSONをダウンロードし、以下に保存してください:")
        print(f"  {CREDENTIALS_FILE}")
        return 1
    except GmailAuthenticationError as exc:
        print("[ERROR] Gmail APIの認証に失敗しました。")
        print(f"内容: {exc}")
        print("再認証する場合は、以下のファイルを削除してから再実行してください:")
        print(f"  {TOKEN_FILE}")
        return 1
    except HttpError as exc:
        print("[ERROR] Gmail APIでエラーが発生しました。")
        print(f"内容: {exc}")
        return 1
    except (OSError, json.JSONDecodeError, KeyError, ValueError) as exc:
        print("[ERROR] 設定またはファイルの読み込みでエラーが発生しました。")
        print(f"内容: {exc}")
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
