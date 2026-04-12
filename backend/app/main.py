import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
load_dotenv()
from app.routers import orders, machines, schedule, csv_import, auth_router, customers, calendar, ai, product_templates, materials, outsource, purchase_orders, operations, settings, users
from app.database import engine, Base, DATABASE_URL

Base.metadata.create_all(bind=engine)

# カラム追加マイグレーション（SQLite・PostgreSQL 両対応）
# 既存テーブルへの後付けカラム追加を起動時に自動適用する
from sqlalchemy import text, inspect as sa_inspect

def _add_column_if_missing(table: str, column: str, col_def_sqlite: str, col_def_pg: str | None = None):
    """テーブルにカラムが存在しない場合のみ ALTER TABLE を実行する。"""
    inspector = sa_inspect(engine)
    try:
        cols = [col["name"] for col in inspector.get_columns(table)]
    except Exception:
        return  # テーブル未作成の場合は create_all に任せる
    if column not in cols:
        col_def = col_def_pg if (col_def_pg and "sqlite" not in DATABASE_URL) else col_def_sqlite
        with engine.connect() as conn:
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {col_def}"))
            conn.commit()

_add_column_if_missing("machines",        "machine_type",        "TEXT",                    "TEXT")
_add_column_if_missing("machines",        "is_outsource",        "BOOLEAN DEFAULT 0",       "BOOLEAN DEFAULT FALSE")
_add_column_if_missing("machines",        "outsource_supplier",  "TEXT",                    "TEXT")
_add_column_if_missing("machines",        "outsource_lead_days", "INTEGER DEFAULT 0",       "INTEGER DEFAULT 0")
_add_column_if_missing("machines",        "batch_capacity",      "INTEGER DEFAULT 1",       "INTEGER DEFAULT 1")
_add_column_if_missing("machines",        "work_start_hour",     "INTEGER",                 "INTEGER")
_add_column_if_missing("machines",        "sort_order",          "INTEGER DEFAULT 0",       "INTEGER DEFAULT 0")
_add_column_if_missing("operations",      "machine_locked",      "BOOLEAN DEFAULT 0",       "BOOLEAN DEFAULT FALSE")
_add_column_if_missing("operations",      "draft_start",         "DATETIME",                "TIMESTAMP")
_add_column_if_missing("operations",      "draft_end",           "DATETIME",                "TIMESTAMP")
_add_column_if_missing("operations",      "draft_machine_id",    "INTEGER",                 "INTEGER")
_add_column_if_missing("operations",      "wait_hours_after",    "FLOAT DEFAULT 0",         "FLOAT DEFAULT 0")
_add_column_if_missing("operations",      "not_before_date",     "DATE",                    "DATE")
_add_column_if_missing("operations",      "schedule_locked",     "BOOLEAN DEFAULT 0",       "BOOLEAN DEFAULT FALSE")
_add_column_if_missing("tenant_settings", "saturday_off",        "BOOLEAN DEFAULT 0",       "BOOLEAN DEFAULT FALSE")
_add_column_if_missing("users",           "role",                "TEXT DEFAULT 'member'",   "TEXT DEFAULT 'member'")

app = FastAPI(title="Operun API", version="0.1.0")

# CORS：本番では ALLOWED_ORIGINS 環境変数にカンマ区切りでURLを指定
# *.vercel.app は全てのVercelプレビューURLを許可するためにallow_origin_regexで対応
_raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173")
ALLOWED_ORIGINS = [o.strip() for o in _raw_origins.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=r"https://.*\.vercel\.app",  # Vercelのプレビュー/本番URL全て許可
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router.router, prefix="/api/auth", tags=["認証"])
app.include_router(orders.router, prefix="/api/orders", tags=["受注"])
app.include_router(machines.router, prefix="/api/machines", tags=["設備"])
app.include_router(schedule.router, prefix="/api/schedule", tags=["スケジュール"])
app.include_router(csv_import.router, prefix="/api/csv", tags=["CSVインポート"])
app.include_router(customers.router, prefix="/api/customers", tags=["顧客"])
app.include_router(calendar.router, prefix="/api/calendar", tags=["カレンダー"])
app.include_router(ai.router, prefix="/api/ai", tags=["AI"])
app.include_router(product_templates.router, prefix="/api/product-templates", tags=["品番テンプレート"])
app.include_router(materials.router, prefix="/api/materials", tags=["材料在庫"])
app.include_router(outsource.router, prefix="/api/outsource", tags=["外注管理"])
app.include_router(purchase_orders.router, prefix="/api/purchase-orders", tags=["発注管理"])
app.include_router(operations.router, prefix="/api/operations", tags=["工程実績"])
app.include_router(settings.router, prefix="/api/settings", tags=["設定"])
app.include_router(users.router, prefix="/api/users", tags=["ユーザー管理"])

@app.get("/")
def root():
    return {"status": "ok", "service": "Operun API"}
