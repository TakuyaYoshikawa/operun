from sqlalchemy import Column, Integer, String, Float, Date, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class Machine(Base):
    """設備マスタ"""
    __tablename__ = "machines"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)           # 設備名（例：旋盤1号機）
    code = Column(String, unique=True, nullable=False)  # 設備コード
    daily_capacity_hours = Column(Float, default=8.0)   # 1日の稼働時間
    setup_time_minutes = Column(Float, default=30.0)    # 標準段取り時間（分）
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())

    operations = relationship("Operation", back_populates="machine")


class Process(Base):
    """工程マスタ"""
    __tablename__ = "processes"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)           # 工程名（例：旋削、フライス）
    code = Column(String, unique=True, nullable=False)
    standard_time_per_unit = Column(Float, nullable=False)  # 単位あたり標準時間（分）
    created_at = Column(DateTime, server_default=func.now())


class Order(Base):
    """受注"""
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    order_number = Column(String, unique=True, nullable=False)  # 受注番号
    product_name = Column(String, nullable=False)               # 品名
    product_code = Column(String, nullable=False)               # 品番
    quantity = Column(Integer, nullable=False)                  # 数量
    due_date = Column(Date, nullable=False)                     # 納期
    priority = Column(Integer, default=3)                       # 優先度 1=特急 2=高 3=通常
    status = Column(String, default="pending")                  # pending / in_progress / done
    note = Column(String, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    operations = relationship("Operation", back_populates="order",
                              cascade="all, delete-orphan")


class Operation(Base):
    """工程（受注×工程の実績）"""
    __tablename__ = "operations"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False)
    machine_id = Column(Integer, ForeignKey("machines.id"), nullable=False)
    process_id = Column(Integer, ForeignKey("processes.id"), nullable=True)
    sequence = Column(Integer, nullable=False)       # 工程順序
    planned_start = Column(DateTime, nullable=True)  # 計画開始日時
    planned_end = Column(DateTime, nullable=True)    # 計画終了日時
    duration_hours = Column(Float, nullable=False)   # 所要時間（時間）
    is_urgent = Column(Boolean, default=False)       # 特急フラグ

    order = relationship("Order", back_populates="operations")
    machine = relationship("Machine", back_populates="operations")
