from sqlalchemy import Column, Integer, String, Float, Date, DateTime, ForeignKey, Boolean, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class Tenant(Base):
    """テナント（会社）マスタ"""
    __tablename__ = "tenants"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)                    # 会社名
    plan = Column(String, default="trial")                   # trial/light/standard/pro
    created_at = Column(DateTime, server_default=func.now())

    users = relationship("User", back_populates="tenant")
    machines = relationship("Machine", back_populates="tenant")
    processes = relationship("Process", back_populates="tenant")
    orders = relationship("Order", back_populates="tenant")


class User(Base):
    """ユーザー（テナントに紐づく）"""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    email = Column(String, unique=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    name = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    role = Column(String, default="member")           # admin / member
    created_at = Column(DateTime, server_default=func.now())

    tenant = relationship("Tenant", back_populates="users")


class Customer(Base):
    """顧客マスタ"""
    __tablename__ = "customers"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    code = Column(String, nullable=False)                     # テナント内で一意（例：C001）
    name = Column(String, nullable=False)                     # 会社名
    contact_name = Column(String, nullable=True)              # 担当者名
    phone = Column(String, nullable=True)
    email = Column(String, nullable=True)
    note = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    tenant = relationship("Tenant")
    orders = relationship("Order", back_populates="customer")


class CalendarHoliday(Base):
    """工場カレンダー（休日・特別稼働日）"""
    __tablename__ = "calendar_holidays"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    date = Column(Date, nullable=False)
    holiday_name = Column(String, nullable=True)              # 例：お盆休み
    working_hours = Column(Float, default=0.0)                # 0=全休 / 4=半日 / 8=通常

    tenant = relationship("Tenant")


class Machine(Base):
    """設備マスタ"""
    __tablename__ = "machines"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    code = Column(String, nullable=False)                    # テナント内で一意
    daily_capacity_hours = Column(Float, default=8.0)
    setup_time_minutes = Column(Float, default=30.0)
    is_active = Column(Boolean, default=True)
    machine_type = Column(String, nullable=True)               # 設備グループ名（例：旋盤・マシニング）
    batch_capacity = Column(Integer, default=1)                 # 同時処理可能数（炉・焼入れ等）
    work_start_hour = Column(Integer, nullable=True)            # 稼働開始時刻（テナント設定を上書き）
    # 外注フィールド（Phase 3）
    is_outsource = Column(Boolean, default=False)
    outsource_supplier = Column(String, nullable=True)         # 外注先名
    outsource_lead_days = Column(Integer, default=0)           # 標準リードタイム
    sort_order = Column(Integer, default=0)                    # 表示順
    created_at = Column(DateTime, server_default=func.now())

    maintenance_windows = relationship("MachineMaintenance", back_populates="machine",
                                       cascade="all, delete-orphan")

    tenant = relationship("Tenant", back_populates="machines")
    operations = relationship("Operation", back_populates="machine", foreign_keys="Operation.machine_id")


class MachineMaintenance(Base):
    """設備メンテナンス枠（定期点検・修理等）"""
    __tablename__ = "machine_maintenance"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    machine_id = Column(Integer, ForeignKey("machines.id"), nullable=False, index=True)
    start_datetime = Column(DateTime, nullable=False)
    end_datetime = Column(DateTime, nullable=False)
    reason = Column(String, nullable=True)                      # 定期点検・修理・清掃等
    created_at = Column(DateTime, server_default=func.now())

    tenant = relationship("Tenant")
    machine = relationship("Machine", back_populates="maintenance_windows")


class Process(Base):
    """工程マスタ"""
    __tablename__ = "processes"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    code = Column(String, nullable=False)                    # テナント内で一意
    standard_time_per_unit = Column(Float, nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    tenant = relationship("Tenant", back_populates="processes")


class Order(Base):
    """受注"""
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=True, index=True)
    order_number = Column(String, nullable=False)            # テナント内で一意
    product_name = Column(String, nullable=False)
    product_code = Column(String, nullable=False)
    quantity = Column(Integer, nullable=False)
    due_date = Column(Date, nullable=False)
    priority = Column(Integer, default=3)                    # 1=特急 2=高 3=通常
    status = Column(String, default="pending")               # pending/in_progress/done
    note = Column(String, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    tenant = relationship("Tenant", back_populates="orders")
    customer = relationship("Customer", back_populates="orders")
    operations = relationship("Operation", back_populates="order",
                              cascade="all, delete-orphan",
                              order_by="Operation.sequence")


class Operation(Base):
    """工程（受注×設備の実績）"""
    __tablename__ = "operations"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False)
    machine_id = Column(Integer, ForeignKey("machines.id"), nullable=False)
    process_id = Column(Integer, ForeignKey("processes.id"), nullable=True)
    sequence = Column(Integer, nullable=False)
    planned_start = Column(DateTime, nullable=True)
    planned_end = Column(DateTime, nullable=True)
    duration_hours = Column(Float, nullable=False)
    is_urgent = Column(Boolean, default=False)
    wait_hours_after = Column(Float, default=0.0)               # 次工程までの待機時間（冷却・乾燥等）
    not_before_date = Column(Date, nullable=True)               # 開始不可日（材料入荷待ち等）

    machine_locked = Column(Boolean, default=False)            # True=設備固定、False=同グループから自動選択
    schedule_locked = Column(Boolean, default=False)           # True=日時固定（再スケジュールで上書き禁止）

    # 下書きスケジュール（確定前の一時保存）
    draft_start      = Column(DateTime, nullable=True)
    draft_end        = Column(DateTime, nullable=True)
    draft_machine_id = Column(Integer, ForeignKey("machines.id"), nullable=True)

    # 実績フィールド
    actual_start = Column(DateTime, nullable=True)
    actual_end = Column(DateTime, nullable=True)
    actual_hours = Column(Float, nullable=True)
    worker = Column(String, nullable=True)
    op_status = Column(String, default="not_started")        # not_started/in_progress/done/on_hold
    actual_note = Column(Text, nullable=True)
    # 外注フィールド（Phase 3）
    outsource_order_date = Column(Date, nullable=True)
    outsource_return_date = Column(Date, nullable=True)
    outsource_cost = Column(Float, nullable=True)
    outsource_status = Column(String, nullable=True)         # ordered/returned/cancelled

    tenant = relationship("Tenant")
    order = relationship("Order", back_populates="operations")
    machine = relationship("Machine", back_populates="operations", foreign_keys=[machine_id])
    process = relationship("Process")
    logs = relationship("OperationLog", back_populates="operation", cascade="all, delete-orphan")


class OperationLog(Base):
    """工程実績ログ"""
    __tablename__ = "operation_logs"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    operation_id = Column(Integer, ForeignKey("operations.id"), nullable=False)
    status = Column(String, nullable=False)                  # not_started/in_progress/done/on_hold
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)
    actual_hours = Column(Float, nullable=True)
    worker = Column(String, nullable=True)
    note = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    tenant = relationship("Tenant")
    operation = relationship("Operation", back_populates="logs")


class TenantSettings(Base):
    """テナント全体の設定"""
    __tablename__ = "tenant_settings"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, unique=True, index=True)
    work_start_hour = Column(Integer, default=8)       # 稼働開始時刻（時）
    work_hours_per_day = Column(Float, default=8.0)    # 1日の稼働時間
    saturday_off = Column(Boolean, default=False)       # 土曜休みフラグ
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    tenant = relationship("Tenant")


# ── Phase 3 ────────────────────────────────────────────────────────────────────

class ProductTemplate(Base):
    """品番テンプレート（簡易BOM）"""
    __tablename__ = "product_templates"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    product_code = Column(String, nullable=False)              # 品番（例：ABC-001）
    product_name = Column(String, nullable=False)              # 品名
    note = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    tenant = relationship("Tenant")
    template_operations = relationship("TemplateOperation", back_populates="template",
                                       cascade="all, delete-orphan", order_by="TemplateOperation.sequence")


class TemplateOperation(Base):
    """品番テンプレートの標準工程"""
    __tablename__ = "template_operations"

    id = Column(Integer, primary_key=True, index=True)
    template_id = Column(Integer, ForeignKey("product_templates.id"), nullable=False)
    sequence = Column(Integer, nullable=False)
    machine_id = Column(Integer, ForeignKey("machines.id"), nullable=False)
    process_id = Column(Integer, ForeignKey("processes.id"), nullable=True)
    hours_per_unit = Column(Float, nullable=False)             # 単位あたり加工時間

    template = relationship("ProductTemplate", back_populates="template_operations")
    machine = relationship("Machine")
    process = relationship("Process")


class Material(Base):
    """材料マスタ"""
    __tablename__ = "materials"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    material_code = Column(String, nullable=False)             # 材料コード（例：MAT-001）
    material_name = Column(String, nullable=False)             # 材料名
    unit = Column(String, nullable=False, default="個")        # kg / m / 本 / 枚 / 個
    stock_quantity = Column(Float, default=0.0)
    reorder_point = Column(Float, default=0.0)                 # 発注点
    unit_price = Column(Float, default=0.0)                    # 単価（円）
    supplier_name = Column(String, nullable=True)
    lead_days = Column(Integer, default=0)                     # 調達リードタイム
    note = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    tenant = relationship("Tenant")
    stock_logs = relationship("MaterialStockLog", back_populates="material", cascade="all, delete-orphan")
    purchase_orders = relationship("PurchaseOrder", back_populates="material", cascade="all, delete-orphan")


class MaterialStockLog(Base):
    """材料入出庫ログ"""
    __tablename__ = "material_stock_logs"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    material_id = Column(Integer, ForeignKey("materials.id"), nullable=False)
    action = Column(String, nullable=False)                    # receive / issue / adjust
    quantity = Column(Float, nullable=False)                   # 正=入庫/増加、負=出庫/減少
    note = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    tenant = relationship("Tenant")
    material = relationship("Material", back_populates="stock_logs")


class PurchaseOrder(Base):
    """原料発注・納入予定"""
    __tablename__ = "purchase_orders"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    material_id = Column(Integer, ForeignKey("materials.id"), nullable=False)
    po_number = Column(String, nullable=False)                  # 発注番号（例：PO-2026-001）
    supplier_name = Column(String, nullable=False)
    quantity = Column(Float, nullable=False)                    # 発注数量
    unit_price = Column(Float, nullable=True)                   # 発注単価
    order_date = Column(Date, nullable=False)                   # 発注日
    expected_delivery_date = Column(Date, nullable=False)       # 納入予定日
    actual_delivery_date = Column(Date, nullable=True)          # 実際の納入日
    received_quantity = Column(Float, nullable=True)            # 実際の受入数量
    status = Column(String, default="ordered")                  # ordered / partial / received / cancelled
    note = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    tenant = relationship("Tenant")
    material = relationship("Material", back_populates="purchase_orders")
