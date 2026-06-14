# 楽天メール Gmailフィルタ自動作成ツール

`info@trend-i-shop.com` に届く楽天関連メールを Gmail API で整理するツールです。

主な機能は次の2つです。

- Gmail ラベルとフィルタを自動作成する
- 楽天の注文内容確認メールから「商品名・SKU・サイズ・価格」だけを抜き出して LINE に通知する

PCを起動しっぱなしにせずLINE通知したい場合は、`apps_script/` の Google Apps Script 版を使います。設定手順は `apps_script/README.md` にまとめています。

## Gmailで作成するラベル

- 楽天
- 楽天/お知らせ
- 楽天/注文
- 楽天/問い合わせ
- 楽天/購入者連絡
- 楽天/返品・キャンセル
- 楽天/重要
- 楽天/精算
- 楽天/迷惑回避

## Google Cloud 側の準備

1. [Google Cloud Console](https://console.cloud.google.com/) を開く
2. プロジェクトを作成する
3. Gmail API を有効化する
4. OAuth 同意画面を設定する
5. OAuth クライアント ID を作成する
6. アプリケーションの種類は「デスクトップアプリ」を選ぶ
7. JSON をダウンロードする
8. `credentials/credentials.json` として保存する
9. 初回実行時にブラウザで Google アカウント認証を行う

必要な Gmail API スコープ:

- `https://www.googleapis.com/auth/gmail.settings.basic`
- `https://www.googleapis.com/auth/gmail.labels`
- `https://www.googleapis.com/auth/gmail.readonly`

`gmail.readonly` は、注文メール本文から商品情報を読むために使います。

## 初回セットアップ

```powershell
cd C:\Users\allja\Desktop\codex-project\楽天メール
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

PowerShell で `.venv\Scripts\activate` が止められる場合でも、上のように `.\.venv\Scripts\python.exe` を直接使えば動きます。

## Gmailフィルタを作成する

```powershell
cd C:\Users\allja\Desktop\codex-project\楽天メール
.\.venv\Scripts\python.exe src\main.py
```

実行結果の例:

```text
[OK] ラベル作成: 楽天/注文
[SKIP] ラベル既存: 楽天/重要
[OK] フィルタ作成: from:order@rakuten.co.jp info@trend-i-shop.com
[SKIP] フィルタ既存: info@trend-i-shop.com チャージバック
```

## LINE通知で送る内容

対象メール:

- 差出人: `order@rakuten.co.jp`
- 件名: `【楽天市場】注文内容ご確認（自動配信メール）`

LINE に送る内容:

```text
楽天 注文商品
受注番号: 402853-20260612-0220534167
日時: 2026-06-12 08:55:46

1. アイリスオーヤマ 4K放送対応ハードディスク 2TB HDCZ-UT2K-IR ブラック(b09h35d7h4)
SKU管理番号:01
サイズ:2TB
価格 21,560(円) x 1(個) = 21,560(円) ※10%税込
```

## LINE通知の準備

LINE Notify は 2025年3月31日で終了しているため、このツールは LINE Messaging API のプッシュ通知を使います。

必要なもの:

- LINE Messaging API のチャネルアクセストークン
- 通知を受ける LINE アカウントが、この公式アカウントを友だち追加していること

LINE Official Account Manager では、右上の「設定」から「Messaging API」を開き、Messaging API を有効化します。その後、LINE Developers 側でチャネルアクセストークンを発行します。

友だちが1人だけなら、`LINE_USER_ID` は不要です。このツールはユーザーIDが未設定の場合、公式アカウントの友だち全員へ通知します。

環境変数に設定します。

```powershell
$env:LINE_CHANNEL_ACCESS_TOKEN="ここにチャネルアクセストークン"
```

または、プロジェクト直下に `.env` を作って保存できます。

```text
LINE_CHANNEL_ACCESS_TOKEN=ここにチャネルアクセストークン
```

特定の1人だけに送りたい場合は、追加で `LINE_USER_ID` も設定できます。

`.env` は Git 管理されないようにしています。

## LINE通知をテストする

まずは LINE に送らず、画面表示だけで確認します。

```powershell
cd C:\Users\allja\Desktop\codex-project\楽天メール
.\.venv\Scripts\python.exe src\order_line_notifier.py --dry-run
```

問題なければ LINE に送信します。

```powershell
.\.venv\Scripts\python.exe src\order_line_notifier.py
```

一度通知したメールIDは `data/processed_order_messages.json` に保存し、同じ注文メールを何度も通知しないようにします。

## 認証をやり直す場合

スコープを追加したため、古い `token.json` では再認証が必要になることがあります。その場合は次を実行してから、もう一度起動してください。

```powershell
Remove-Item .\credentials\token.json -ErrorAction SilentlyContinue
.\.venv\Scripts\python.exe src\order_line_notifier.py --dry-run
```

## 自動実行する場合

Windows のタスクスケジューラで、数分おきに次のコマンドを実行する設定にします。

```powershell
C:\Users\allja\Desktop\codex-project\楽天メール\.venv\Scripts\python.exe C:\Users\allja\Desktop\codex-project\楽天メール\src\order_line_notifier.py
```

## Git管理しないファイル

次のファイルは `.gitignore` に入れています。

- `credentials/credentials.json`
- `credentials/token.json`
- `.venv/`
- `__pycache__/`
- `*.pyc`
- `.env`
- `data/processed_order_messages.json`
