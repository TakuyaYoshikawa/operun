"""
デモデータ投入スクリプト（拡張版）
実行: python seed.py

デモテナント:
  会社名: 山田製作所
  Email:  demo@example.com
  Pass:   demo1234
"""

import sys, os
from datetime import date, datetime, timedelta

sys.path.insert(0, os.path.dirname(__file__))

from app.database import SessionLocal, engine, Base
from app import models
from app.auth import hash_password
from app.scheduler.engine import SchedulingEngine, OperationInput, MachineCalendar

# ── DB 再作成 ─────────────────────────────────────────────────────────────────
Base.metadata.drop_all(bind=engine)
Base.metadata.create_all(bind=engine)
db = SessionLocal()
today = date.today()
now  = datetime.now()

# ── テナント・ユーザー ────────────────────────────────────────────────────────
print("テナント・ユーザーを投入中...")
tenant = models.Tenant(name="山田製作所", plan="standard")
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

# ── 設備マスタ ────────────────────────────────────────────────────────────────
print("設備マスタを投入中...")
machines_data = [
    {"code": "M01", "name": "旋盤1号機",       "machine_type": "旋盤",      "daily_capacity_hours": 8.0,  "setup_time_minutes": 30.0, "is_outsource": False},
    {"code": "M02", "name": "旋盤2号機",       "machine_type": "旋盤",      "daily_capacity_hours": 8.0,  "setup_time_minutes": 30.0, "is_outsource": False},
    {"code": "M03", "name": "マシニング1号機",  "machine_type": "マシニング", "daily_capacity_hours": 8.0,  "setup_time_minutes": 45.0, "is_outsource": False},
    {"code": "M04", "name": "マシニング2号機",  "machine_type": "マシニング", "daily_capacity_hours": 8.0,  "setup_time_minutes": 45.0, "is_outsource": False},
    {"code": "M05", "name": "フライス盤1号機",  "machine_type": "フライス盤", "daily_capacity_hours": 7.0,  "setup_time_minutes": 20.0, "is_outsource": False},
    {"code": "M06", "name": "研削盤1号機",     "machine_type": "研削盤",    "daily_capacity_hours": 8.0,  "setup_time_minutes": 15.0, "is_outsource": False},
    {"code": "M07", "name": "ワイヤーカット",   "machine_type": "ワイヤーカット", "daily_capacity_hours": 16.0, "setup_time_minutes": 60.0, "is_outsource": False},
    {"code": "OUT1", "name": "熱処理（外注）",  "machine_type": None, "daily_capacity_hours": 8.0,  "setup_time_minutes": 0.0,
     "is_outsource": True, "outsource_supplier": "中部熱処理工業", "outsource_lead_days": 3},
    {"code": "OUT2", "name": "メッキ（外注）",  "machine_type": None, "daily_capacity_hours": 8.0,  "setup_time_minutes": 0.0,
     "is_outsource": True, "outsource_supplier": "東洋メッキ工業", "outsource_lead_days": 5},
]
machines = {}
for m in machines_data:
    obj = models.Machine(**m, tenant_id=tenant.id)
    db.add(obj)
    db.flush()
    machines[m["code"]] = obj
db.commit()
print(f"  {len(machines)} 件登録")

# ── 工程マスタ ────────────────────────────────────────────────────────────────
print("工程マスタを投入中...")
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
processes = {}
for p in processes_data:
    obj = models.Process(**p, tenant_id=tenant.id)
    db.add(obj)
    db.flush()
    processes[p["code"]] = obj
db.commit()
print(f"  {len(processes)} 件登録")

# ── 顧客マスタ ────────────────────────────────────────────────────────────────
print("顧客マスタを投入中...")
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
customers = {}
for c in customers_data:
    obj = models.Customer(**c, tenant_id=tenant.id)
    db.add(obj)
    db.flush()
    customers[c["code"]] = obj
db.commit()
print(f"  {len(customers)} 件登録")

# ── カレンダー祝日 ────────────────────────────────────────────────────────────
print("カレンダー祝日を投入中...")
try:
    import jpholiday
    year = today.year
    current = date(year, 1, 1)
    cal_count = 0
    while current <= date(year, 12, 31):
        name = jpholiday.is_holiday_name(current)
        if name:
            db.add(models.CalendarHoliday(
                tenant_id=tenant.id, date=current, holiday_name=name, working_hours=0.0
            ))
            cal_count += 1
        current += timedelta(days=1)
    db.commit()
    print(f"  {cal_count} 件の祝日を登録（{year}年）")
except ImportError:
    print("  jpholiday 未インストール - スキップ")

# ── 材料マスタ ────────────────────────────────────────────────────────────────
print("材料マスタを投入中...")
materials_data = [
    {"material_code": "MAT-001", "material_name": "SUS304 丸棒 φ50",   "unit": "本", "stock_quantity": 45,   "reorder_point": 20, "unit_price": 3200,  "supplier_name": "東京鋼材",     "lead_days": 5},
    {"material_code": "MAT-002", "material_name": "SUS304 丸棒 φ80",   "unit": "本", "stock_quantity": 12,   "reorder_point": 15, "unit_price": 7800,  "supplier_name": "東京鋼材",     "lead_days": 5},
    {"material_code": "MAT-003", "material_name": "S45C 丸棒 φ60",    "unit": "本", "stock_quantity": 60,   "reorder_point": 25, "unit_price": 1800,  "supplier_name": "中部鋼材センター", "lead_days": 3},
    {"material_code": "MAT-004", "material_name": "S45C 角棒 50×50",  "unit": "本", "stock_quantity": 8,    "reorder_point": 10, "unit_price": 2400,  "supplier_name": "中部鋼材センター", "lead_days": 3},
    {"material_code": "MAT-005", "material_name": "アルミ A5052 板 t3", "unit": "枚", "stock_quantity": 30,   "reorder_point": 10, "unit_price": 4500,  "supplier_name": "アルミ商事",   "lead_days": 7},
    {"material_code": "MAT-006", "material_name": "鉄板 SS400 t6",     "unit": "枚", "stock_quantity": 5,    "reorder_point": 8,  "unit_price": 6200,  "supplier_name": "大阪鉄鋼",     "lead_days": 4},
    {"material_code": "MAT-007", "material_name": "C3604 快削黄銅棒 φ20", "unit": "本", "stock_quantity": 100,  "reorder_point": 30, "unit_price": 980,   "supplier_name": "非鉄金属商会", "lead_days": 2},
    {"material_code": "MAT-008", "material_name": "SKD11 丸棒 φ40",   "unit": "本", "stock_quantity": 3,    "reorder_point": 5,  "unit_price": 18500, "supplier_name": "特殊鋼商事",   "lead_days": 10},
]
materials = {}
for m in materials_data:
    obj = models.Material(**m, tenant_id=tenant.id)
    db.add(obj)
    db.flush()
    materials[m["material_code"]] = obj
db.commit()

# 入出庫ログを追加
stock_logs = [
    ("MAT-001", "receive", 50,  "初期在庫入庫"),
    ("MAT-001", "issue",   5,   "ORD-001 使用"),
    ("MAT-002", "receive", 20,  "初期在庫入庫"),
    ("MAT-002", "issue",   8,   "加工使用"),
    ("MAT-003", "receive", 80,  "初期在庫入庫"),
    ("MAT-003", "issue",   20,  "ORD-003 使用"),
    ("MAT-004", "receive", 15,  "初期在庫入庫"),
    ("MAT-004", "issue",   7,   "加工使用"),
    ("MAT-005", "receive", 40,  "初期在庫入庫"),
    ("MAT-005", "issue",   10,  "ORD-007 使用"),
    ("MAT-006", "receive", 10,  "初期在庫入庫"),
    ("MAT-006", "issue",   5,   "加工使用"),
    ("MAT-007", "receive", 150, "初期在庫入庫"),
    ("MAT-007", "issue",   50,  "量産使用"),
    ("MAT-008", "receive", 5,   "初期在庫入庫"),
    ("MAT-008", "issue",   2,   "金型加工使用"),
]
for code, action, qty, note in stock_logs:
    db.add(models.MaterialStockLog(
        tenant_id=tenant.id,
        material_id=materials[code].id,
        action=action,
        quantity=qty if action == "receive" else -qty,
        note=note,
    ))
db.commit()
print(f"  {len(materials)} 件登録（入出庫ログ {len(stock_logs)} 件）")

# ── 発注管理 ──────────────────────────────────────────────────────────────────
print("発注管理データを投入中...")
purchase_orders_data = [
    {"material_code": "MAT-002", "supplier_name": "東京鋼材",      "quantity": 30, "unit_price": 7600,
     "order_date": today - timedelta(days=3), "expected_delivery_date": today + timedelta(days=2),
     "status": "ordered",  "po_number": f"PO-{today.year}-001", "note": "急ぎ手配"},
    {"material_code": "MAT-004", "supplier_name": "中部鋼材センター", "quantity": 20, "unit_price": 2300,
     "order_date": today - timedelta(days=5), "expected_delivery_date": today + timedelta(days=1),
     "status": "ordered",  "po_number": f"PO-{today.year}-002"},
    {"material_code": "MAT-006", "supplier_name": "大阪鉄鋼",      "quantity": 15, "unit_price": 6000,
     "order_date": today - timedelta(days=8), "expected_delivery_date": today - timedelta(days=1),
     "status": "partial",  "po_number": f"PO-{today.year}-003",
     "received_quantity": 8, "note": "7枚は来週納入予定"},
    {"material_code": "MAT-008", "supplier_name": "特殊鋼商事",    "quantity": 10, "unit_price": 17800,
     "order_date": today - timedelta(days=2), "expected_delivery_date": today + timedelta(days=8),
     "status": "ordered",  "po_number": f"PO-{today.year}-004"},
    {"material_code": "MAT-001", "supplier_name": "東京鋼材",      "quantity": 40, "unit_price": 3100,
     "order_date": today - timedelta(days=12), "expected_delivery_date": today - timedelta(days=3),
     "actual_delivery_date": today - timedelta(days=3), "received_quantity": 40,
     "status": "received", "po_number": f"PO-{today.year}-005"},
]
for po in purchase_orders_data:
    code = po.pop("material_code")
    obj = models.PurchaseOrder(**po, material_id=materials[code].id, tenant_id=tenant.id)
    db.add(obj)
db.commit()
print(f"  {len(purchase_orders_data)} 件登録")

# ── 品番テンプレート ──────────────────────────────────────────────────────────
print("品番テンプレートを投入中...")
templates_data = [
    {
        "product_code": "SHA-STD", "product_name": "標準シャフト",
        "ops": [
            {"sequence": 1, "machine_code": "M01", "process_code": "P01", "hours_per_unit": 0.08},
            {"sequence": 2, "machine_code": "M06", "process_code": "P04", "hours_per_unit": 0.04},
        ],
    },
    {
        "product_code": "FLG-STD", "product_name": "標準フランジ",
        "ops": [
            {"sequence": 1, "machine_code": "M03", "process_code": "P03", "hours_per_unit": 0.12},
            {"sequence": 2, "machine_code": "M06", "process_code": "P04", "hours_per_unit": 0.03},
        ],
    },
    {
        "product_code": "BLK-STD", "product_name": "機械加工ブロック",
        "ops": [
            {"sequence": 1, "machine_code": "M05", "process_code": "P02", "hours_per_unit": 0.15},
            {"sequence": 2, "machine_code": "M03", "process_code": "P03", "hours_per_unit": 0.10},
            {"sequence": 3, "machine_code": "OUT1", "process_code": "P06", "hours_per_unit": 0.05},
        ],
    },
    {
        "product_code": "PIN-STD", "product_name": "標準ピン",
        "ops": [
            {"sequence": 1, "machine_code": "M02", "process_code": "P01", "hours_per_unit": 0.02},
            {"sequence": 2, "machine_code": "M06", "process_code": "P04", "hours_per_unit": 0.01},
        ],
    },
    {
        "product_code": "DIE-STD", "product_name": "金型部品",
        "ops": [
            {"sequence": 1, "machine_code": "M03", "process_code": "P03", "hours_per_unit": 0.30},
            {"sequence": 2, "machine_code": "M07", "process_code": "P05", "hours_per_unit": 0.20},
            {"sequence": 3, "machine_code": "OUT1", "process_code": "P06", "hours_per_unit": 0.10},
            {"sequence": 4, "machine_code": "M06", "process_code": "P04", "hours_per_unit": 0.08},
        ],
    },
]
for t in templates_data:
    tmpl = models.ProductTemplate(
        tenant_id=tenant.id,
        product_code=t["product_code"],
        product_name=t["product_name"],
    )
    db.add(tmpl)
    db.flush()
    for op in t["ops"]:
        db.add(models.TemplateOperation(
            template_id=tmpl.id,
            sequence=op["sequence"],
            machine_id=machines[op["machine_code"]].id,
            process_id=processes[op["process_code"]].id,
            hours_per_unit=op["hours_per_unit"],
        ))
db.commit()
print(f"  {len(templates_data)} 件登録")

# ── 受注データ ────────────────────────────────────────────────────────────────
print("受注データを投入中...")

orders_raw = [
    # (order_number, product_name, product_code, quantity, due_days, priority, status, note, customer_code, operations)
    # ── 完了済み ──
    ("ORD-001", "シャフト部品A",     "SHA-001", 50,   -8,  2, "done",        "表面粗さ Ra1.6 指定",         "C001",
     [("M01","P01",1,3.5,False),("M06","P04",2,1.5,False)]),
    ("ORD-002", "カラー部品B",       "CLR-002", 200,  -5,  3, "done",        None,                          "C003",
     [("M02","P01",1,4.0,False)]),
    ("ORD-003", "フランジ部品C",     "FLG-003", 20,   -3,  3, "done",        "仕上げ精度 h6",               "C002",
     [("M03","P03",1,5.0,False),("M06","P04",2,1.0,False)]),
    # ── 進行中 ──
    ("ORD-004", "ブラケット部品D",   "BKT-004", 100,  2,   1, "in_progress", "特急対応・得意先優先",        "C001",
     [("M05","P02",1,3.0,True),("M03","P03",2,2.0,False)]),
    ("ORD-005", "ピン部品E",         "PIN-005", 500,  4,   2, "in_progress", "大量ロット・寸法公差 ±0.01",  "C002",
     [("M02","P01",1,6.0,False),("M06","P04",2,3.0,False)]),
    ("ORD-006", "ハウジング部品F",   "HOS-006", 10,   5,   2, "in_progress", "材料: SKD11",                  "C004",
     [("M03","P03",1,8.0,False),("M05","P02",2,2.0,False),("OUT1","P06",3,2.0,False)]),
    # ── 未着手（近い納期） ──
    ("ORD-007", "スリーブ部品G",     "SLV-007", 30,   3,   2, "pending",     None,                          "C003",
     [("M01","P01",1,4.0,False),("M06","P04",2,2.0,False)]),
    ("ORD-008", "プレート部品H",     "PLT-008", 15,   4,   3, "pending",     "アルミ A5052 使用",           "C005",
     [("M04","P03",1,5.0,False)]),
    ("ORD-009", "ギア部品I",         "GER-009", 5,    5,   1, "pending",     "特急・歯面研削必要",           "C001",
     [("M03","P03",1,10.0,True),("M06","P04",2,4.0,True)]),
    ("ORD-010", "軸受けホルダJ",     "BRG-010", 8,    6,   2, "pending",     None,                          "C006",
     [("M01","P01",1,3.0,False),("M03","P03",2,4.0,False),("M06","P04",3,1.5,False)]),
    ("ORD-011", "カバー部品K",       "CVR-011", 40,   7,   3, "pending",     "板金溶接後加工",               "C007",
     [("M05","P02",1,4.5,False)]),
    ("ORD-012", "ノズル部品L",       "NZL-012", 25,   8,   2, "pending",     "SUS304 精密加工",             "C002",
     [("M01","P01",1,2.0,False),("M03","P03",2,3.0,False)]),
    # ── 未着手（余裕あり） ──
    ("ORD-013", "スパイラルシャフトM","SPR-013", 12,   10,  3, "pending",     None,                          "C004",
     [("M01","P01",1,5.0,False),("M07","P05",2,3.0,False),("M06","P04",3,2.0,False)]),
    ("ORD-014", "ボルトブロックN",   "BBK-014", 60,   11,  3, "pending",     "M20 タップ加工",              "C003",
     [("M04","P03",1,4.0,False),("M02","P01",2,2.0,False)]),
    ("ORD-015", "ダイプレートO",     "DPL-015", 4,    12,  2, "pending",     "SKD11 焼入れ後研削",          "C006",
     [("M03","P03",1,12.0,False),("OUT1","P06",2,3.0,False),("M06","P04",3,4.0,False)]),
    ("ORD-016", "インサート部品P",   "INS-016", 80,   13,  3, "pending",     None,                          "C008",
     [("M02","P01",1,3.0,False)]),
    ("ORD-017", "リング部品Q",       "RNG-017", 35,   14,  2, "pending",     "内径 H7 公差",                "C005",
     [("M01","P01",1,4.0,False),("M06","P04",2,2.0,False)]),
    ("ORD-018", "スペーサーR",       "SPC-018", 150,  15,  3, "pending",     "大量ロット",                  "C007",
     [("M02","P01",1,5.0,False)]),
    ("ORD-019", "治具部品S",         "JIG-019", 2,    17,  2, "pending",     "精度品・個別検査",             "C001",
     [("M04","P03",1,8.0,False),("M07","P05",2,4.0,False),("M06","P04",3,3.0,False)]),
    ("ORD-020", "カムフォロアT",     "CAM-020", 20,   18,  3, "pending",     None,                          "C004",
     [("M03","P03",1,6.0,False),("M06","P04",2,2.0,False)]),
    ("ORD-021", "プランジャーU",     "PLN-021", 10,   20,  3, "pending",     "SUS303 切削",                 "C002",
     [("M01","P01",1,3.5,False),("M06","P04",2,1.5,False)]),
    ("ORD-022", "フィードピンV",     "FDP-022", 300,  21,  3, "pending",     None,                          "C008",
     [("M02","P01",1,4.0,False)]),
    ("ORD-023", "コレットチャックW", "COL-023", 6,    23,  2, "pending",     "内面研削",                    "C006",
     [("M01","P01",1,5.0,False),("M06","P04",2,4.0,False)]),
    ("ORD-024", "バルブシートX",     "VLV-024", 18,   25,  3, "pending",     None,                          "C003",
     [("M03","P03",1,7.0,False),("M06","P04",2,3.0,False)]),
    ("ORD-025", "金型コアY",         "MDL-025", 3,    28,  2, "pending",     "高精度・複数工程",             "C006",
     [("M04","P03",1,14.0,False),("M07","P05",2,8.0,False),("OUT1","P06",3,4.0,False),("M06","P04",4,5.0,False)]),
]

op_inputs = []
all_orders = {}
for row in orders_raw:
    onum, pname, pcode, qty, ddays, pri, status, note, ccode, op_defs = row
    order = models.Order(
        tenant_id=tenant.id,
        order_number=onum,
        product_name=pname,
        product_code=pcode,
        quantity=qty,
        due_date=today + timedelta(days=ddays),
        priority=pri,
        status=status,
        note=note,
        customer_id=customers[ccode].id,
    )
    db.add(order)
    db.flush()
    all_orders[onum] = order

    for mc, pc, seq, dur, urgent in op_defs:
        op = models.Operation(
            tenant_id=tenant.id,
            order_id=order.id,
            machine_id=machines[mc].id,
            process_id=processes[pc].id,
            sequence=seq,
            duration_hours=dur,
            is_urgent=urgent,
        )
        db.add(op)
        db.flush()

        if status in ("pending", "in_progress"):
            op_inputs.append(OperationInput(
                order_id=order.id,
                order_number=onum,
                product_name=pname,
                sequence=seq,
                machine_id=machines[mc].id,
                duration_hours=dur,
                due_date=today + timedelta(days=ddays),
                priority=pri,
                is_urgent=urgent,
            ))

db.commit()
print(f"  {len(orders_raw)} 件登録")

# ── スケジューリング実行 ──────────────────────────────────────────────────────
print("スケジューリングを実行中（EDD）...")
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
        op.planned_end   = result.planned_end

db.commit()
delayed = [r for r in results if r.is_delayed]
print(f"  {len(results)} 工程をスケジュール済み（遅延: {len(delayed)} 件）")

# ── 工程実績データ（進行中・完了の工程に実績をセット） ────────────────────────
print("工程実績データを投入中...")

# 完了済み受注の工程に実績を付与
done_order_nums = [r[0] for r in orders_raw if r[6] == "done"]
for onum in done_order_nums:
    order = all_orders[onum]
    ops = db.query(models.Operation).filter(
        models.Operation.order_id == order.id
    ).order_by(models.Operation.sequence).all()
    base_dt = datetime.combine(order.due_date - timedelta(days=1), datetime.min.time()).replace(hour=9)
    for i, op in enumerate(ops):
        start = base_dt + timedelta(hours=i * (op.duration_hours + 0.5))
        end   = start + timedelta(hours=op.duration_hours)
        op.op_status   = "done"
        op.actual_start = start
        op.actual_end   = end
        op.actual_hours = round(op.duration_hours * (0.9 + 0.1 * (i % 3)), 1)
        op.worker       = ["山田", "鈴木", "田中"][i % 3]
        db.add(models.OperationLog(
            tenant_id=tenant.id, operation_id=op.id,
            status="done", started_at=start, finished_at=end,
            actual_hours=op.actual_hours, worker=op.worker,
        ))

# 進行中受注の第1工程を作業中にする
inprog_order_nums = [r[0] for r in orders_raw if r[6] == "in_progress"]
for onum in inprog_order_nums:
    order = all_orders[onum]
    first_op = db.query(models.Operation).filter(
        models.Operation.order_id == order.id,
        models.Operation.sequence == 1,
    ).first()
    if first_op:
        first_op.op_status    = "in_progress"
        first_op.actual_start = datetime.now() - timedelta(hours=2)
        first_op.worker       = ["山田", "鈴木"][list(inprog_order_nums).index(onum) % 2]
        db.add(models.OperationLog(
            tenant_id=tenant.id, operation_id=first_op.id,
            status="in_progress", started_at=first_op.actual_start,
            worker=first_op.worker,
        ))

db.commit()
print(f"  完了: {len(done_order_nums)} 受注 / 作業中: {len(inprog_order_nums)} 受注")

# ── 完了 ──────────────────────────────────────────────────────────────────────
print()
print("=" * 48)
print("デモデータの投入が完了しました")
print(f"  設備:   {len(machines)} 件（外注2件含む）")
print(f"  工程:   {len(processes)} 件")
print(f"  顧客:   {len(customers_data)} 件")
print(f"  材料:   {len(materials)} 件")
print(f"  発注:   {len(purchase_orders_data)} 件")
print(f"  品番テンプレート: {len(templates_data)} 件")
print(f"  受注:   {len(orders_raw)} 件（完了3・進行中3・未着手19）")
print(f"  スケジュール済: {len(results)} 工程（遅延: {len(delayed)} 件）")
print()
print("ログイン情報:")
print("  Email:    demo@example.com")
print("  Password: demo1234")
print()
print("  http://localhost:5173 を開いてください")
print("=" * 48)
db.close()
