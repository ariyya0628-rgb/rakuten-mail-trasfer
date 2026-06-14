import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from googleapiclient.errors import HttpError

from gmail_client import GmailAuthenticationError, get_gmail_service
from line_client import LineMessagingError, broadcast_text_message, push_text_message
from order_parser import extract_text_from_payload, format_line_message, parse_order_email


PROJECT_ROOT = Path(__file__).resolve().parents[1]
CONFIG_FILE = PROJECT_ROOT / "config" / "line_notifications.json"
ENV_FILE = PROJECT_ROOT / ".env"


def load_env_file(path=ENV_FILE):
    if not path.exists():
        return

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


def load_config():
    return json.loads(CONFIG_FILE.read_text(encoding="utf-8"))


def load_processed_store(path):
    if not path.exists():
        return {"messages": {}}
    return json.loads(path.read_text(encoding="utf-8"))


def save_processed_store(path, store):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(store, ensure_ascii=False, indent=2), encoding="utf-8")


def list_message_ids(service, query):
    message_ids = []
    request = service.users().messages().list(userId="me", q=query, maxResults=50)

    while request is not None:
        response = request.execute()
        message_ids.extend(message["id"] for message in response.get("messages", []))
        request = service.users().messages().list_next(request, response)

    return message_ids


def get_message_text(service, message_id):
    message = service.users().messages().get(
        userId="me",
        id=message_id,
        format="full",
    ).execute()
    return extract_text_from_payload(message.get("payload", {}))


def notify_orders(dry_run=False):
    load_env_file()
    config = load_config()
    store_path = PROJECT_ROOT / config["processed_store"]
    store = load_processed_store(store_path)
    processed_messages = store.setdefault("messages", {})

    service = get_gmail_service()
    message_ids = list_message_ids(service, config["gmail_query"])

    if not message_ids:
        print("[INFO] 対象メールなし")
        return 0

    channel_access_token = os.environ.get("LINE_CHANNEL_ACCESS_TOKEN")
    user_id = os.environ.get("LINE_USER_ID")
    if not dry_run and not channel_access_token:
        print("[ERROR] LINE_CHANNEL_ACCESS_TOKEN を環境変数または .env に設定してください。")
        return 1

    sent_count = 0
    for message_id in reversed(message_ids):
        if message_id in processed_messages:
            continue

        text = get_message_text(service, message_id)
        order = parse_order_email(text)
        if not order.get("products"):
            print(f"[SKIP] 商品情報なし: {message_id}")
            continue

        line_message = format_line_message(order, config.get("line_message_prefix", "楽天 注文商品"))

        if dry_run:
            print("=" * 40)
            print(line_message)
        else:
            if user_id:
                push_text_message(channel_access_token, user_id, line_message)
            else:
                broadcast_text_message(channel_access_token, line_message)
            print(f"[OK] LINE通知: {order.get('order_number') or message_id}")

            processed_messages[message_id] = {
                "order_number": order.get("order_number", ""),
                "notified_at": datetime.now(timezone.utc).isoformat(),
            }
        sent_count += 1

    if sent_count and not dry_run:
        save_processed_store(store_path, store)

    if dry_run:
        print(f"[INFO] プレビュー件数: {sent_count}")
    else:
        print(f"[INFO] 通知件数: {sent_count}")
    return 0


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="LINE送信せず、抽出結果だけ表示します。")
    args = parser.parse_args()

    try:
        return notify_orders(dry_run=args.dry_run)
    except GmailAuthenticationError as exc:
        print("[ERROR] Gmail APIの認証に失敗しました。")
        print(f"内容: {exc}")
        print("スコープを追加したため、必要なら credentials/token.json を削除して再認証してください。")
        return 1
    except HttpError as exc:
        print("[ERROR] Gmail APIでエラーが発生しました。")
        print(f"内容: {exc}")
        return 1
    except LineMessagingError as exc:
        print(f"[ERROR] {exc}")
        return 1
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        print("[ERROR] 設定または処理中にエラーが発生しました。")
        print(f"内容: {exc}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
