"""
デモデータ投入スクリプト（マルチテナント対応）
実行: python seed.py

デモテナント:
  会社名: 山田製作所
  Email:  demo@example.com
  Pass:   demo1234
"""

import sys, os
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(__file__))

from app.database import SessionLocal, engine, Base
from app import models
from app.auth import hash_password
from app.scheduler.engine import SchedulingEngine, OperationInput, MachineCalendar

# DBを再作成（スキーマ変更対応）
Base.metadata.drop_all(bind=engine)
Base.metadata.create_all(bind=engine)
db = SessionLocal()

print("テナント・ユーザーを投入中...")
tenant = models.Tenant(name="山田製作所", plan="trial")
db.add(tenant)
db.flush()

user = models.User(
    tenant_id=tenant.id,
    email="demo@example.com",
    hashed_password=hash_password("demo1234"),
    name="山田 太郎",
)
db.add(user)
db.commit()
print(f"  テナント: {tenant.name} (id={tenant.id})")
print(f"  ユーザー: {user.email} / パスワード: demo1234")

print("設備マスタを投入中...")
machines_data = [
    {"code": "M01", "name": "旋盤1号機",      "daily_capacity_hours": 8.0, "setup_time_minutes": 30.0},
    {"code": "M02", "name": "旋盤2号機",      "daily_capacity_hours": 8.0, "setup_time_minutes": 30.0},
    {"code": "M03", "name": "マシニング1号機", "daily_capacity_hours": 8.0, "setup_time_minutes": 45.0},
    {"code": "M04", "name": "フライス盤1号機", "daily_capacity_hours": 7.0, "setup_time_minutes": 20.0},
    {"code": "M05", "name": "研削盤1号機",    "daily_capacity_hours": 8.0, "setup_time_minutes": 15.0},
]
machines = {}
for m in machines_data:
    obj = models.Machine(**m, tenant_id=tenant.id)
    db.add(obj)
    db.flush()
    machines[m["code"]] = obj
db.commit()
print(f"  {len(machines)} 件登録")

print("工程マスタを投入中...")
processes_data = [
    {"code": "P01", "name": "旋削",        "standard_time_per_unit": 12.0},
    {"code": "P02", "name": "フライス加工", "standard_time_per_unit": 18.0},
    {"code": "P03", "name": "研削",        "standard_time_per_unit": 8.0},
    {"code": "P04", "name": "マシニング",   "standard_time_per_unit": 25.0},
    {"code": "P05", "name": "検査",        "standard_time_per_unit": 5.0},
]
processes = {}
for p in processes_data:
    obj = models.Process(**p, tenant_id=tenant.id)
    db.add(obj)
    db.flush()
    processes[p["code"]] = obj
db.commit()
print(f"  {len(processes)} 件登録")

today = date.today()

print("顧客マスタを投入中...")
customers_data = [
    {"code": "C001", "name": "鈴木商事",     "contact_name": "鈴木一郎", "phone": "03-1234-5678", "email": "suzuki@example.com"},
    {"code": "C002", "name": "田中製作所",   "contact_name": "田中花子", "phone": "06-9876-5432", "email": "tanaka@example.com"},
    {"code": "C003", "name": "佐藤エンジニアリング", "contact_name": "佐藤次郎", "phone": "052-111-2222", "email": "sato@example.com"},
]
customers = {}
for c in customers_data:
    obj = models.Customer(**c, tenant_id=tenant.id)
    db.add(obj)
    db.flush()
    customers[c["code"]] = obj
db.commit()
print(f"  {len(customers)} 件登録")

print("カレンダー休日を投入中...")
import jpholiday
from datetime import timedelta as td
year = today.year
current = date(year, 1, 1)
cal_count = 0
while current <= date(year, 12, 31):
    holiday_name = jpholiday.is_holiday_name(current)
    if holiday_name:
        db.add(models.CalendarHoliday(
            tenant_id=tenant.id,
            date=current,
            holiday_name=holiday_name,
            working_hours=0.0,
        ))
        cal_count += 1
    current += td(days=1)
db.commit()
print(f"  {cal_count} 件の祝日を登録（{year}年）")

print("受注データを投入中...")
orders_data = [
    {
        "order_number": "ORD-001", "product_name": "シャフト部品A",
        "product_code": "SHA-001", "quantity": 50,
        "due_date": today + timedelta(days=5), "priority": 2, "status": "pending",
        "note": "表面粗さ Ra1.6 指定", "customer_code": "C001",
        "operations": [
            {"machine_code": "M01", "process_code": "P01", "sequence": 1, "duration_hours": 4.0},
            {"machine_code": "M05", "process_code": "P03", "sequence": 2, "duration_hours": 2.0},
        ],
    },
    {
        "order_number": "ORD-002", "product_name": "フランジ部品B",
        "product_code": "FLG-002", "quantity": 20,
        "due_date": today + timedelta(days=8), "priority": 3, "status": "pending",
        "note": None, "customer_code": "C002",
        "operations": [
            {"machine_code": "M03", "process_code": "P04", "sequence": 1, "duration_hours": 6.0},
            {"machine_code": "M05", "process_code": "P03", "sequence": 2, "duration_hours": 1.5},
        ],
    },
    {
        "order_number": "ORD-003", "product_name": "ブラケット部品C",
        "product_code": "BKT-003", "quantity": 100,
        "due_date": today + timedelta(days=3), "priority": 1, "status": "in_progress",
        "note": "特急対応・得意先優先", "customer_code": "C001",
        "operations": [
            {"machine_code": "M04", "process_code": "P02", "sequence": 1, "duration_hours": 3.0, "is_urgent": True},
        ],
    },
    {
        "order_number": "ORD-004", "product_name": "カラー部品D",
        "product_code": "CLR-004", "quantity": 200,
        "due_date": today + timedelta(days=12), "priority": 3, "status": "pending",
        "note": None, "customer_code": "C003",
        "operations": [
            {"machine_code": "M01", "process_code": "P01", "sequence": 1, "duration_hours": 5.0},
        ],
    },
    {
        "order_number": "ORD-005", "product_name": "ピン部品E",
        "product_code": "PIN-005", "quantity": 500,
        "due_date": today + timedelta(days=7), "priority": 2, "status": "pending",
        "note": "大量ロット・寸法公差 +-0.01", "customer_code": "C002",
        "operations": [
            {"machine_code": "M02", "process_code": "P01", "sequence": 1, "duration_hours": 8.0},
            {"machine_code": "M05", "process_code": "P03", "sequence": 2, "duration_hours": 4.0},
        ],
    },
    {
        "order_number": "ORD-006", "product_name": "ハウジング部品F",
        "product_code": "HOS-006", "quantity": 10,
        "due_date": today + timedelta(days=15), "priority": 3, "status": "pending",
        "note": None, "customer_code": "C003",
        "operations": [
            {"machine_code": "M03", "process_code": "P04", "sequence": 1, "duration_hours": 10.0},
            {"machine_code": "M04", "process_code": "P02", "sequence": 2, "duration_hours": 3.0},
        ],
    },
]

op_inputs = []
for od in orders_data:
    cust_code = od.get("customer_code")
    order = models.Order(
        tenant_id=tenant.id,
        order_number=od["order_number"],
        product_name=od["product_name"],
        product_code=od["product_code"],
        quantity=od["quantity"],
        due_date=od["due_date"],
        priority=od["priority"],
        status=od["status"],
        note=od["note"],
        customer_id=customers[cust_code].id if cust_code else None,
    )
    db.add(order)
    db.flush()

    for op_def in od["operations"]:
        is_urgent = op_def.get("is_urgent", False)
        op = models.Operation(
            tenant_id=tenant.id,
            order_id=order.id,
            machine_id=machines[op_def["machine_code"]].id,
            process_id=processes[op_def["process_code"]].id,
            sequence=op_def["sequence"],
            duration_hours=op_def["duration_hours"],
            is_urgent=is_urgent,
        )
        db.add(op)
        op_inputs.append(OperationInput(
            order_id=order.id,
            order_number=order.order_number,
            product_name=order.product_name,
            sequence=op_def["sequence"],
            machine_id=machines[op_def["machine_code"]].id,
            duration_hours=op_def["duration_hours"],
            due_date=order.due_date,
            priority=order.priority,
            is_urgent=is_urgent,
        ))

db.commit()
print(f"  {len(orders_data)} 件登録")

print("スケジューリングを実行中...")
calendars = {
    m.id: MachineCalendar(machine_id=m.id, daily_hours=m.daily_capacity_hours)
    for m in machines.values()
}
engine_obj = SchedulingEngine(calendars)
results = engine_obj.schedule(op_inputs)

for result in results:
    ops = db.query(models.Operation).filter(
        models.Operation.tenant_id == tenant.id,
        models.Operation.order_id == result.order_id,
        models.Operation.sequence == result.sequence,
        models.Operation.machine_id == result.machine_id,
    ).all()
    for op in ops:
        op.planned_start = result.planned_start
        op.planned_end = result.planned_end

db.commit()
delayed = [r for r in results if r.is_delayed]
print(f"  {len(results)} 工程をスケジュール済み（遅延: {len(delayed)} 件）")

print()
print("========================================")
print("デモデータの投入が完了しました")
print(f"  設備: {len(machines)} / 工程: {len(processes)} / 受注: {len(orders_data)}")
print()
print("ログイン情報:")
print("  Email:    demo@example.com")
print("  Password: demo1234")
print()
print("  http://localhost:5173 を開いてください")
print("========================================")

db.close()
