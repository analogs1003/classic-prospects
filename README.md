# クラシック有力馬ランキング DB

2027年クラシック世代（2024年産・現2歳）の有力馬データベースと、毎週のレース結果に応じたランキング推移ダッシュボードです。  
比較用として 2026年クラシック世代（2023年産・現3歳）のバックテストデータも切り替え表示できます。

## 公開構成（GitHub Pages）

静的ファイルのみで構成されているため、そのまま GitHub Pages で公開できます。

- `index.html` / `styles.css` / `app.js` — ランキングダッシュボード本体
- `data/classic_2027_prospects.js` — 2027年世代の現在データ＆スナップショット履歴
- `data/classic_2026_prospects.js` — 2026年世代の検証アーカイブデータ
- `data/snapshots_2027.json` — 2027年世代の過去ランキングスナップショット蓄積用 JSON
- `build_initial_db.py` — 2027年世代データベース・スナップショット・JS生成スクリプト
- `build_backtest_2026.py` — 2026年世代バックテストデータ生成スクリプト

## GitHub Pages 初回公開手順

1. GitHub 上で新しい Public リポジトリを作成する（例: `classic-prospects`）
2. このフォルダの内容を `main` ブランチへ push（または GitHub Web UI からアップロード）する
3. リポジトリの **Settings → Pages** を開く
4. **Build and deployment** の Source で **Deploy from a branch** を選び、Branch を `main` / `/ (root)` に設定して **Save**
5. 1分ほど待つと `https://<GitHubユーザー名>.github.io/<リポジトリ名>/` で公開されます

## 週末レース後の更新フロー

1. `build_initial_db.py` にレース結果を反映する
2. 以下のコマンドでデータとスナップショットを更新する（日付は開催日を指定）
   ```bash
   python build_initial_db.py --snapshot-date YYYY-MM-DD
   ```
3. 変更された `build_initial_db.py`、`data/snapshots_2027.json`、`data/classic_2027_prospects.js` などを GitHub へ push する
4. 数十秒〜1分ほどで GitHub Pages が自動更新されます

