from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
load_dotenv()
from app.routers import orders, machines, schedule, csv_import, auth_router, customers, calendar, ai, product_templates, materials, outsource, purchase_orders, operations, settings
from app.database import engine, Base

Base.metadata.create_all(bind=engine)

# SQLite 用カラム追加マイグレーション（Alembic 未導入のため手動）
from sqlalchemy import text, inspect as sa_inspect
def _add_column_if_missing(table: str, column: str, col_def: str):
    with engine.connect() as conn:
        cols = [row[1] for row in conn.execute(text(f"PRAGMA table_info({table})"))]
        if column not in cols:
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {col_def}"))
            conn.commit()

_add_column_if_missing("machines",   "machine_type",        "TEXT")
_add_column_if_missing("machines",   "is_outsource",        "BOOLEAN DEFAULT 0")
_add_column_if_missing("machines",   "outsource_supplier",  "TEXT")
_add_column_if_missing("machines",   "outsource_lead_days", "INTEGER DEFAULT 0")
_add_column_if_missing("operations", "machine_locked",      "BOOLEAN DEFAULT 0")
_add_column_if_missing("operations", "draft_start",         "DATETIME")
_add_column_if_missing("operations", "draft_end",           "DATETIME")
_add_column_if_missing("operations", "draft_machine_id",    "INTEGER")

app = FastAPI(title="Operun API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
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

@app.get("/")
def root():
    return {"status": "ok", "service": "Operun API"}
