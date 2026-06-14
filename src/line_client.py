import requests


LINE_PUSH_ENDPOINT = "https://api.line.me/v2/bot/message/push"
LINE_BROADCAST_ENDPOINT = "https://api.line.me/v2/bot/message/broadcast"


class LineMessagingError(RuntimeError):
    pass


def push_text_message(channel_access_token, user_id, text):
    response = requests.post(
        LINE_PUSH_ENDPOINT,
        headers={
            "Authorization": f"Bearer {channel_access_token}",
            "Content-Type": "application/json",
        },
        json={
            "to": user_id,
            "messages": [{"type": "text", "text": text}],
        },
        timeout=30,
    )

    if response.status_code >= 400:
        raise LineMessagingError(f"LINE送信エラー: {response.status_code} {response.text}")

    return response


def broadcast_text_message(channel_access_token, text):
    response = requests.post(
        LINE_BROADCAST_ENDPOINT,
        headers={
            "Authorization": f"Bearer {channel_access_token}",
            "Content-Type": "application/json",
        },
        json={
            "messages": [{"type": "text", "text": text}],
        },
        timeout=30,
    )

    if response.status_code >= 400:
        raise LineMessagingError(f"LINE送信エラー: {response.status_code} {response.text}")

    return response
