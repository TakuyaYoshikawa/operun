from sqlalchemy import Column, Integer, String, Float, Date, DateTime, ForeignKey, Boolean
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
    created_at = Column(DateTime, server_default=func.now())

    tenant = relationship("Tenant", back_populates="users")


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
    created_at = Column(DateTime, server_default=func.now())

    tenant = relationship("Tenant", back_populates="machines")
    operations = relationship("Operation", back_populates="machine")


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
    operations = relationship("Operation", back_populates="order",
                              cascade="all, delete-orphan")


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

    tenant = relationship("Tenant")
    order = relationship("Order", back_populates="operations")
    machine = relationship("Machine", back_populates="operations")
