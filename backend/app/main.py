from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import orders, machines, schedule
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

app.include_router(orders.router, prefix="/api/orders", tags=["受注"])
app.include_router(machines.router, prefix="/api/machines", tags=["設備"])
app.include_router(schedule.router, prefix="/api/schedule", tags=["スケジュール"])

@app.get("/")
def root():
    return {"status": "ok", "service": "Operun API"}
