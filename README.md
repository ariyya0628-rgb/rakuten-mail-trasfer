# 楽天メール Gmailフィルタ・注文通知ツール

お名前.comの `info@trend-i-shop.com` 宛メールをGmailで整理し、楽天の注文メールから商品名・価格だけを取り出して通知するためのプロジェクトです。

主な機能は次の2つです。

- GmailラベルとGmailフィルタを自動作成する
- 楽天の注文内容確認メールから、商品名・SKU・サイズ・価格を取り出してDiscordへ通知する

## 現在の運用

通常運用はGoogle Apps Script版を使います。

- PCを起動し続けなくてよい
- Gmailに新しい注文メールが届くと、数分おきに自動確認する
- すでに通知済みの注文は再通知しない
- Discord Webhookへ通知する

Python版はローカル確認やGmailフィルタ作成用です。

## 管理しない秘密ファイル

次のファイルはGitHubに保存しません。

- `credentials/credentials.json`
- `credentials/token.json`
- `.env`
- `.venv/`
- `__pycache__/`
- `*.pyc`
- `data/processed_order_messages.json`

別PCで使う場合、これらは必要に応じて作り直すか、各サービスから再取得します。

## フォルダ構成

```text
楽天メール/
├─ README.md
├─ requirements.txt
├─ .gitignore
├─ apps_script/
│  ├─ Code_Discord.gs
│  └─ README_Discord.md
├─ config/
│  ├─ filters.json
│  └─ line_notifications.json
├─ credentials/
│  └─ .gitkeep
├─ data/
│  └─ .gitkeep
└─ src/
   ├─ main.py
   ├─ gmail_client.py
   ├─ labels.py
   ├─ filters.py
   ├─ order_parser.py
   └─ order_line_notifier.py
```

## 初回セットアップ

PowerShellで実行します。

```powershell
cd C:\Users\allja\Desktop\codex-project\楽天メール
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

PowerShellで `.venv\Scripts\activate` が止められる場合は、無理に有効化せず、次のように直接Pythonを実行してください。

```powershell
.\.venv\Scripts\python.exe src\main.py
```

## Google Cloud側の設定

1. Google Cloud Consoleを開く
2. プロジェクトを作成する
3. Gmail APIを有効化する
4. OAuth同意画面を設定する
5. OAuthクライアントIDを作成する
6. アプリケーションの種類は「デスクトップアプリ」を選ぶ
7. JSONをダウンロードする
8. `credentials/credentials.json` として保存する
9. 初回実行時にブラウザでGoogleアカウント認証を行う

必要なGmail APIスコープ:

- `https://www.googleapis.com/auth/gmail.settings.basic`
- `https://www.googleapis.com/auth/gmail.labels`
- `https://www.googleapis.com/auth/gmail.readonly`

`gmail.readonly` は、注文メール本文から商品情報を読むために使います。

## Gmailフィルタ作成

次のコマンドで、Gmailラベルとフィルタを作成します。

```powershell
cd C:\Users\allja\Desktop\codex-project\楽天メール
.\.venv\Scripts\python.exe src\main.py
```

`credentials/token.json` は初回認証後に自動保存されます。認証エラーが出た場合は、古い `credentials/token.json` を削除して再認証します。

```powershell
Remove-Item .\credentials\token.json -ErrorAction SilentlyContinue
.\.venv\Scripts\python.exe src\main.py
```

## Discord通知の設定

通常運用は `apps_script/Code_Discord.gs` をGoogle Apps Scriptに貼り付けて使います。

Discordへ通知する内容は、スマホのプッシュ通知で見やすいように商品名と金額だけにしています。注文番号や日時は通知本文には出しません。

1. sdonowsen側のGoogleアカウントでApps Scriptを開く
2. `apps_script/Code_Discord.gs` の内容をコード欄へ貼り付ける
3. 保存する
4. Apps Scriptの「プロジェクトの設定」を開く
5. スクリプトプロパティに次を追加する

```text
DISCORD_WEBHOOK_URL
```

値にはDiscordのWebhook URLを入れます。Webhook URLは秘密情報なので、GitHubには保存しません。

### Discord Webhookの作り方

1. Discordで通知したいサーバーとチャンネルを開く
2. チャンネル設定を開く
3. 「連携サービス」または「Integrations」を開く
4. Webhookを作成する
5. Webhook URLをコピーする

### Apps Scriptで実行する関数

接続テスト:

```text
testDiscordWebhookOnly
```

Gmail検索の確認:

```text
debugRecentRakutenOrders
```

今後の自動通知を開始:

```text
setupDiscordTrigger
```

自動通知を止める:

```text
deleteDiscordTriggers
```

過去3日分を今回だけ送る:

```text
sendLast3DaysUnnotifiedToDiscord
```

通常運用では `sendLast3DaysUnnotifiedToDiscord` は使いません。新着だけを送るには `setupDiscordTrigger` を1回実行すれば十分です。

## 別PCから使う場合

別PCでは、GitHubからプロジェクトを取得してから、秘密ファイルと認証を作り直します。

```powershell
cd C:\Users\allja\Desktop\codex-project
git clone https://github.com/ariyya0628-rgb/rakuten-mail-trasfer.git 楽天メール
cd 楽天メール
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

別PCで必要な作業:

- `credentials/credentials.json` をGoogle Cloudから再取得して配置する
- 初回実行でGoogle認証を行い、`credentials/token.json` を作成する
- Apps Script側のスクリプトプロパティ `DISCORD_WEBHOOK_URL` を再設定する
- Apps ScriptのトリガーはPCではなくGoogle側で動くため、基本的には別PCで常時起動する必要はない

注意点:

- `credentials/token.json` はPCごとの認証情報なので、GitHubには置かない
- `.env` やWebhook URLはGitHubに置かない
- Apps Scriptのコードを更新した場合は、GitHubのコードだけでなくApps Script画面にも貼り直す
- 複数のGoogleアカウントを使う場合は、必ず注文メールが届くアカウント側のApps Scriptで設定する

## GitHubへ保存する手順

変更をGitHubへ保存する場合:

```powershell
cd C:\Users\allja\Desktop\codex-project\楽天メール
git status --short --branch
git add .
git commit -m "Update documentation"
git push
```

初回だけ送信先が未設定の場合:

```powershell
git remote add origin https://github.com/ariyya0628-rgb/rakuten-mail-trasfer.git
git push -u origin master
```

`dubious ownership` が出た場合:

```powershell
git config --global --add safe.directory "C:/Users/allja/Desktop/codex-project/楽天メール"
```

## GitHubから最新版を取り込む手順

別PCや別環境でGitHub上の最新版を取り込む場合:

```powershell
cd C:\Users\allja\Desktop\codex-project\楽天メール
git pull
```

ローカルで未保存の変更がある場合は、先に `git status --short --branch` で確認してください。
