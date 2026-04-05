from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
load_dotenv()
from app.routers import orders, machines, schedule, csv_import, auth_router, customers, calendar, ai, product_templates, materials, outsource, purchase_orders
from app.database import engine, Base

Base.metadata.create_all(bind=engine)

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

@app.get("/")
def root():
    return {"status": "ok", "service": "Operun API"}
