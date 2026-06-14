# Discord版 楽天注文通知

LINEの月間上限を避けるためのDiscord Webhook版です。

## 安全な動き

- 既存メールは `initializeDiscordNotifier` で通知済みにする
- 初期化後に届いた新着メールだけ通知する
- 受注番号ベースで重複通知を防ぐ
- 複数の新着があれば古い順にまとめて送る
- Gmail側に対象ラベルを付ける

## Gmailラベル

- `楽天/Discord通知対象`
- `楽天/Discord通知済み`
- `楽天/Discord通知失敗`

## Discord Webhookを作る

1. Discordで通知したいサーバーとチャンネルを開く
2. チャンネルの設定を開く
3. 「連携サービス」または「Integrations」を開く
4. 「Webhook」を作成
5. Webhook URLをコピー

## Apps Scriptに入れる

1. sdonowsen側のApps Scriptを開く
2. `apps_script/Code_Discord.gs` の中身を全部貼り付ける
3. 保存する
4. プロジェクトの設定を開く
5. スクリプトプロパティに次を追加する

```text
DISCORD_WEBHOOK_URL
```

値にはDiscord Webhook URLを入れます。

## 初回に必ず実行する

最初に必ずこれを実行します。

```text
initializeDiscordNotifier
```

これはLINE/Discordへ送信しません。  
今ある対象メールを通知済みにして、今後の新着だけ通知するための初期化です。

## 自動実行を開始する

初期化が終わったら次を実行します。

```text
setupDiscordTrigger
```

これで5分おきに新着注文メールを確認します。

## 止める

```text
deleteDiscordTriggers
```

## テスト

本文抽出だけ確認する場合は次を実行します。

```text
testDiscordParserOnly
```

これはDiscordへ送信しません。
