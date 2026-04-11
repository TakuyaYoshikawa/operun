"""
マスターデータのみ追加/更新スクリプト（DBを壊さずに実行可能）
実行: python seed_masters.py

既存テナントの設備・工程・顧客マスタを upsert する。
受注・スケジュールデータには一切触れない。
"""

import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from app.database import SessionLocal, engine, Base
from app import models

Base.metadata.create_all(bind=engine)
db = SessionLocal()

# テナントを取得（なければ作成）
tenant = db.query(models.Tenant).first()
if not tenant:
    tenant = models.Tenant(name="山田製作所", plan="standard")
    db.add(tenant)
    db.commit()
    print(f"テナントを作成しました: {tenant.name}")
else:
    print(f"テナント: {tenant.name} (id={tenant.id})")


# ── 設備マスタ（upsert） ──────────────────────────────────────────────────────
print("\n設備マスタを登録中...")
machines_data = [
    {"code": "M01", "name": "旋盤1号機",       "machine_type": "旋盤",          "daily_capacity_hours": 8.0,  "setup_time_minutes": 30.0, "batch_capacity": 1, "work_start_hour": 8, "is_active": True, "is_outsource": False, "sort_order": 0},
    {"code": "M02", "name": "旋盤2号機",       "machine_type": "旋盤",          "daily_capacity_hours": 8.0,  "setup_time_minutes": 30.0, "batch_capacity": 1, "work_start_hour": 8, "is_active": True, "is_outsource": False, "sort_order": 1},
    {"code": "M03", "name": "マシニング1号機",  "machine_type": "マシニング",     "daily_capacity_hours": 8.0,  "setup_time_minutes": 45.0, "batch_capacity": 1, "work_start_hour": 8, "is_active": True, "is_outsource": False, "sort_order": 2},
    {"code": "M04", "name": "マシニング2号機",  "machine_type": "マシニング",     "daily_capacity_hours": 8.0,  "setup_time_minutes": 45.0, "batch_capacity": 1, "work_start_hour": 8, "is_active": True, "is_outsource": False, "sort_order": 3},
    {"code": "M05", "name": "フライス盤1号機",  "machine_type": "フライス盤",     "daily_capacity_hours": 7.0,  "setup_time_minutes": 20.0, "batch_capacity": 1, "work_start_hour": 8, "is_active": True, "is_outsource": False, "sort_order": 4},
    {"code": "M06", "name": "研削盤1号機",     "machine_type": "研削盤",        "daily_capacity_hours": 8.0,  "setup_time_minutes": 15.0, "batch_capacity": 1, "work_start_hour": 8, "is_active": True, "is_outsource": False, "sort_order": 5},
    {"code": "M07", "name": "ワイヤーカット",   "machine_type": "ワイヤーカット", "daily_capacity_hours": 16.0, "setup_time_minutes": 60.0, "batch_capacity": 1, "work_start_hour": 8, "is_active": True, "is_outsource": False, "sort_order": 6},
    {"code": "OUT1", "name": "熱処理（外注）",  "machine_type": None,            "daily_capacity_hours": 8.0,  "setup_time_minutes": 0.0,  "batch_capacity": 1, "work_start_hour": 8, "is_active": True, "is_outsource": True, "outsource_supplier": "中部熱処理工業", "outsource_lead_days": 3, "sort_order": 7},
    {"code": "OUT2", "name": "メッキ（外注）",  "machine_type": None,            "daily_capacity_hours": 8.0,  "setup_time_minutes": 0.0,  "batch_capacity": 1, "work_start_hour": 8, "is_active": True, "is_outsource": True, "outsource_supplier": "東洋メッキ工業",   "outsource_lead_days": 5, "sort_order": 8},
]

for data in machines_data:
    existing = db.query(models.Machine).filter(
        models.Machine.tenant_id == tenant.id,
        models.Machine.code == data["code"],
    ).first()
    if existing:
        for k, v in data.items():
            setattr(existing, k, v)
        print(f"  更新: {data['name']}")
    else:
        db.add(models.Machine(**data, tenant_id=tenant.id))
        print(f"  追加: {data['name']}")

db.commit()


# ── 工程マスタ（upsert） ──────────────────────────────────────────────────────
print("\n工程マスタを登録中...")
processes_data = [
    {"code": "P01", "name": "旋削",          "standard_time_per_unit": 10.0},
    {"code": "P02", "name": "フライス加工",   "standard_time_per_unit": 15.0},
    {"code": "P03", "name": "マシニング",     "standard_time_per_unit": 20.0},
    {"code": "P04", "name": "研削",          "standard_time_per_unit": 6.0},
    {"code": "P05", "name": "ワイヤーカット", "standard_time_per_unit": 12.0},
    {"code": "P06", "name": "熱処理",        "standard_time_per_unit": 8.0},
    {"code": "P07", "name": "メッキ処理",    "standard_time_per_unit": 4.0},
    {"code": "P08", "name": "検査・仕上げ",  "standard_time_per_unit": 3.0},
]

for data in processes_data:
    existing = db.query(models.Process).filter(
        models.Process.tenant_id == tenant.id,
        models.Process.code == data["code"],
    ).first()
    if existing:
        for k, v in data.items():
            setattr(existing, k, v)
        print(f"  更新: {data['name']}")
    else:
        db.add(models.Process(**data, tenant_id=tenant.id))
        print(f"  追加: {data['name']}")

db.commit()


# ── 顧客マスタ（upsert） ──────────────────────────────────────────────────────
print("\n顧客マスタを登録中...")
customers_data = [
    {"code": "C001", "name": "鈴木商事",             "contact_name": "鈴木一郎",   "phone": "03-1234-5678", "email": "suzuki@suzuki-shoji.co.jp"},
    {"code": "C002", "name": "田中精機製作所",        "contact_name": "田中花子",   "phone": "06-9876-5432", "email": "tanaka@tanaka-seiki.co.jp"},
    {"code": "C003", "name": "佐藤エンジニアリング",  "contact_name": "佐藤次郎",   "phone": "052-111-2222", "email": "sato@sato-eng.co.jp"},
    {"code": "C004", "name": "中村自動車部品",        "contact_name": "中村健太",   "phone": "045-333-4444", "email": "nakamura@nakamura-auto.co.jp"},
    {"code": "C005", "name": "小林重工業",            "contact_name": "小林美咲",   "phone": "075-555-6666", "email": "kobayashi@kobayashi-heavy.co.jp"},
    {"code": "C006", "name": "加藤精密工業",          "contact_name": "加藤浩二",   "phone": "011-777-8888", "email": "kato@kato-seimitsu.co.jp"},
    {"code": "C007", "name": "伊藤電機",              "contact_name": "伊藤真理子", "phone": "092-999-0000", "email": "ito@ito-denki.co.jp"},
    {"code": "C008", "name": "渡辺プラスチック工業",  "contact_name": "渡辺誠",     "phone": "022-112-3344", "email": "watanabe@watanabe-plastic.co.jp"},
]

for data in customers_data:
    existing = db.query(models.Customer).filter(
        models.Customer.tenant_id == tenant.id,
        models.Customer.code == data["code"],
    ).first()
    if existing:
        for k, v in data.items():
            setattr(existing, k, v)
        print(f"  更新: {data['name']}")
    else:
        db.add(models.Customer(**data, tenant_id=tenant.id))
        print(f"  追加: {data['name']}")

db.commit()

# ── 完了 ──────────────────────────────────────────────────────────────────────
machines_count  = db.query(models.Machine).filter(models.Machine.tenant_id == tenant.id).count()
processes_count = db.query(models.Process).filter(models.Process.tenant_id == tenant.id).count()
customers_count = db.query(models.Customer).filter(models.Customer.tenant_id == tenant.id).count()

print()
print("=" * 48)
print("マスターデータの登録が完了しました")
print(f"  設備:   {machines_count} 件")
print(f"  工程:   {processes_count} 件")
print(f"  顧客:   {customers_count} 件")
print()
print("受注・スケジュールデータは変更していません。")
print("=" * 48)
db.close()
