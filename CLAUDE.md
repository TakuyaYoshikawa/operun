# Operun 開発ガイド（Claude Code用）

## プロジェクト概要
金属加工・部品加工業向け軽量生産スケジューラSaaS「Operun」の開発。
個人事業主として中小製造業に提供するMVP（Phase 1）を構築する。

## 開発方針

### 基本姿勢
- **制限に達するまで止まらず開発を進める**
- 確認が必要な場合は作業を続けながらコメントに残す
- 小さな判断（命名・ファイル構成・軽微な設計）は自律的に決定してよい
- 迷ったときはシンプルな方を選ぶ

### 作業の進め方
1. タスクが完了したら次のタスクを自律的に開始する
2. エラーが出たら自分で修正してから報告する
3. ファイルを作成したら必ず動作確認（`python -c`等）を行う
4. 1つのタスクが終わったら「✅ 完了：〇〇」と報告し次に進む

---

## 技術スタック

| 層 | 技術 |
|---|---|
| バックエンド | Python 3.12 / FastAPI / SQLAlchemy |
| DB（開発） | SQLite（`operun_dev.db`） |
| DB（本番予定） | PostgreSQL on Supabase |
| フロントエンド | React + TypeScript + Vite |
| ガントチャート | Frappe Gantt（Phase 1）|
| 最適化エンジン | 自作EDD（Phase 1）→ OR-Tools（Phase 3）|
| インフラ | Vercel（フロント）/ Railway（バック）|
| 決済 | Stripe（Phase 2以降）|

---

## ディレクトリ構成

```
operun/
├── CLAUDE.md               ← このファイル
├── SETUP.md                ← セットアップ手順
├── PHASE1_REQUIREMENTS.md  ← Phase 1 機能要件書（詳細仕様・デモシナリオ）
├── mvp_requirements.html  ← 全フェーズの機能要件マップ（Phase 2・3含む）
├── frontend/               ← React + Vite（未作成）
└── backend/
    ├── requirements.txt
    ├── .env                ← DATABASE_URL等（要作成）
    └── app/
        ├── main.py         ← FastAPIエントリポイント（作成済み）
        ├── models.py       ← DBモデル（作成済み）
        ├── database.py     ← DB接続（作成済み）
        ├── scheduler/
        │   └── engine.py   ← スケジューリングエンジン（作成済み・テスト済み）
        └── routers/
            ├── schedule.py ← スケジュールAPI（作成済み）
            ├── orders.py   ← 受注CRUD（未作成）
            └── machines.py ← 設備マスタCRUD（未作成）
```

---

## Phase 1 実装タスク（優先順）

### バックエンド
- [ ] `app/routers/orders.py` — 受注CRUD API
- [ ] `app/routers/machines.py` — 設備・工程マスタCRUD API
- [ ] `/api/schedule/simulate/delivery` — 納期回答支援エンドポイント追加
- [ ] CSVインポートエンドポイント（受注・マスタ）
- [ ] `.env`サンプルファイル作成

### フロントエンド
- [ ] `frontend/`のVite + React + TypeScriptプロジェクト初期化
- [ ] 設備・工程マスタ登録画面
- [ ] 受注登録・一覧画面
- [ ] ガントチャート画面（Frappe Gantt使用）
- [ ] 納期アラートダッシュボード
- [ ] 納期シミュレーター画面（F-05）

---

## 各機能の仕様

### F-05 納期回答支援（最重要・差別化機能）
既存の`simulate_insert()`をラップして`/api/schedule/simulate/delivery`に追加する。

**リクエスト例**
```json
{
  "product_name": "部品A",
  "machine_id": 1,
  "duration_hours": 8.0,
  "due_date": "2026-04-30",
  "priority": 3,
  "is_urgent": false
}
```

**レスポンス例**
```json
{
  "feasible": true,
  "completion_date": "2026年4月8日（水）",
  "business_days": 5,
  "affected_orders": ["ORD-042"],
  "affected_count": 1
}
```

### スケジューリングエンジン
- `backend/app/scheduler/engine.py`に実装済み・テスト済み
- アルゴリズム：EDD（Earliest Due Date）フォワードスケジューリング
- Phase 3でOR-Toolsの数理最適化エンジンに差し替え予定
- **直接編集しない**。ロジック変更が必要な場合は先に相談すること

### DBモデル
`models.py`に以下が定義済み：
- `Machine`（設備マスタ）
- `Process`（工程マスタ）
- `Order`（受注）
- `Operation`（工程×受注の実績）

---

## コーディング規約

- **Python**：型ヒントを必ず付ける / docstringは日本語OK
- **API**：レスポンスはPydanticモデルで定義する
- **エラーハンドリング**：`HTTPException`を使い適切なステータスコードを返す
- **コメント**：日本語で書いてよい
- **テスト**：追加した関数には最低1つのテストを書く

---

## 起動コマンド

```bash
# バックエンド
cd backend
source venv/bin/activate
uvicorn app.main:app --reload --port 8000

# API確認
open http://localhost:8000/docs

# フロントエンド（作成後）
cd frontend
npm run dev
```

---

## GitHub運用ルール

### ブランチ戦略
- `master`：本番相当のブランチ。**直接コミット禁止**
- `feature/xxx`：機能開発用。開発再開のたびに新しいブランチを作成する

### ブランチ命名規則
```
feature/phase1-backend-crud
feature/phase1-frontend-gantt
feature/phase1-delivery-simulator
feature/phase2-reschedule
```

### 開発開始時のルール
**毎回の開発再開時に必ず以下を実行してから作業を始める：**
```bash
git checkout master
git pull origin master
git checkout -b feature/[作業内容]
```

### コミットのタイミング
以下のチェックポイントで必ずコミットする：
- 1つのAPIエンドポイントが完成してテストが通ったとき
- 1つの画面コンポーネントが動作確認できたとき
- バグを修正したとき
- 作業を中断するとき

### コミットメッセージ規則
```
feat: 受注CRUD APIを追加
feat: 納期シミュレーター画面を追加
fix: ガントチャートの日付表示バグを修正
refactor: スケジューリングエンジンのログ出力を整理
test: 受注APIのテストを追加
```

### プルリクエストとマージのルール
1. 機能が完成したら`feature/xxx`をpushする
2. GitHubでPull Requestを作成し、変更内容を日本語で説明する
3. **オーナー（私）が確認・承認するまでmasterにはマージしない**
4. 承認後にmasterへマージする
5. マージ後はfeatureブランチを削除する

### 初回セットアップ（まだGitリポジトリがない場合）
```bash
cd operun
git init
git add .
git commit -m "feat: プロジェクト初期構成を追加"
git branch -M master
git remote add origin https://github.com/[username]/operun.git
git push -u origin master
```

---

## 注意事項

- `engine.py`のスケジューリングロジックは**テスト済みのため直接変更しない**
- SQLiteはローカル開発専用。本番はSupabase PostgreSQLを使う
- `.env`ファイルをコミットしない（`.gitignore`に追加すること）
- フロントのAPIベースURLは環境変数`VITE_API_URL`で管理する
