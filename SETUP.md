# Operun セットアップ手順書
## Phase 1 — ローカル開発環境構築（所要時間：約30分）

---

## 前提条件
- Node.js 18以上（`node --version`で確認）
- Python 3.10以上（`python3 --version`で確認）
- Git

---

## 1. プロジェクト作成

```bash
mkdir operun && cd operun

# フロントエンド
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
npm install axios @tanstack/react-query zustand
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
cd ..

# バックエンド
mkdir backend && cd backend
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install fastapi uvicorn sqlalchemy python-dotenv
pip install "python-jose[cryptography]" passlib[bcrypt]
cd ..
```

---

## 2. ディレクトリ構成（完成形）

```
operun/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Gantt/           # ガントチャート
│   │   │   ├── Orders/          # 受注一覧・登録
│   │   │   └── Masters/         # 設備・工程マスタ
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Orders.tsx
│   │   │   └── Schedule.tsx     # メイン画面
│   │   ├── api/                 # FastAPI呼び出し
│   │   └── store/               # Zustand状態管理
│   └── package.json
│
└── backend/
    ├── app/
    │   ├── main.py              # FastAPIエントリポイント
    │   ├── models.py            # DBモデル（SQLAlchemy）
    │   ├── routers/
    │   │   ├── orders.py        # 受注API
    │   │   ├── machines.py      # 設備マスタAPI
    │   │   └── schedule.py      # スケジューリングAPI
    │   └── scheduler/
    │       └── engine.py        # スケジューリングロジック
    ├── requirements.txt
    └── .env
```

---

## 3. 起動コマンド

```bash
# バックエンド（別ターミナル）
cd backend
source venv/bin/activate
uvicorn app.main:app --reload --port 8000

# フロントエンド（別ターミナル）
cd frontend
npm run dev
```

ブラウザで http://localhost:5173 を開く

---

## 4. 開発の進め方（推奨順序）

1. バックエンドのDBモデル定義（models.py）
2. 受注・設備マスタのCRUD API
3. スケジューリングエンジン（engine.py）
4. フロントの受注登録フォーム
5. ガントチャート表示
6. 納期アラート

最初の1週間はガントチャートを一切触らず、バックエンドのスケジューリングロジックだけを固めることを推奨。
