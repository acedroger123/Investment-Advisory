"""
SQLAlchemy ORM models for the Stock Portfolio Advisory System.
"""
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, Date, ForeignKey, BigInteger, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from datetime import datetime
import enum

from .db import Base


class RiskPreference(str, enum.Enum):
    """Risk preference levels for goals."""
    LOW = "low"
    MODERATE = "moderate"
    HIGH = "high"


class GoalStatus(str, enum.Enum):
    """Status of a financial goal."""
    ACTIVE = "active"
    ACHIEVED = "achieved"
    CANCELLED = "cancelled"


class TransactionType(str, enum.Enum):
    """Type of stock transaction."""
    BUY = "buy"
    SELL = "sell"


class User(Base):
    """User model for storing user information."""
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    email = Column(String(100), unique=True, nullable=False)
    created_at = Column(DateTime, default=func.now())
    
    # Relationships
    goals = relationship("Goal", back_populates="user", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<User(id={self.id}, username='{self.username}')>"


class Goal(Base):
    """Financial goal model."""
    __tablename__ = "goals"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String(100), nullable=False)
    description = Column(String(500))
    target_amount = Column(Float, nullable=False)
    profit_buffer = Column(Float, default=0.10)  # 10% default
    target_value = Column(Float)  # Calculated: target_amount * (1 + profit_buffer)
    initial_investment = Column(Float, default=0.0)
    deadline = Column(Date, nullable=False)
    risk_preference = Column(String(20), default=RiskPreference.MODERATE.value)
    status = Column(String(20), default=GoalStatus.ACTIVE.value)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    
    # Relationships
    user = relationship("User", back_populates="goals")
    transactions = relationship("Transaction", back_populates="goal", cascade="all, delete-orphan")
    holdings = relationship("Holding", back_populates="goal", cascade="all, delete-orphan")
    
    def calculate_target_value(self):
        """Calculate the target value including profit buffer."""
        self.target_value = self.target_amount * (1 + self.profit_buffer)
        return self.target_value
    
    def __repr__(self):
        return f"<Goal(id={self.id}, name='{self.name}', target={self.target_amount})>"


class Transaction(Base):
    """Stock transaction record - scoped to a specific goal."""
    __tablename__ = "transactions"
    
    id = Column(Integer, primary_key=True, index=True)
    goal_id = Column(Integer, ForeignKey("goals.id"), nullable=False)
    stock_symbol = Column(String(20), nullable=False, index=True)
    stock_name = Column(String(100))
    transaction_type = Column(String(10), nullable=False)  # BUY or SELL
    quantity = Column(Integer, nullable=False)
    price = Column(Float, nullable=False)
    total_value = Column(Float)  # quantity * price
    transaction_date = Column(Date, nullable=False)
    validated = Column(Boolean, default=False)
    validation_message = Column(String(200))
    notes = Column(String(500))
    created_at = Column(DateTime, default=func.now())
    
    # Relationships
    goal = relationship("Goal", back_populates="transactions")
    
    def calculate_total_value(self):
        """Calculate total transaction value."""
        self.total_value = self.quantity * self.price
        return self.total_value
    
    def __repr__(self):
        return f"<Transaction(id={self.id}, {self.transaction_type} {self.quantity} {self.stock_symbol} @ {self.price})>"


class Holding(Base):
    """Per-goal stock holding - tracks current position for a specific goal."""
    __tablename__ = "holdings"
    
    id = Column(Integer, primary_key=True, index=True)
    goal_id = Column(Integer, ForeignKey("goals.id"), nullable=False)
    stock_symbol = Column(String(20), nullable=False, index=True)
    stock_name = Column(String(100))
    quantity = Column(Integer, nullable=False, default=0)
    avg_buy_price = Column(Float, nullable=False, default=0.0)
    total_invested = Column(Float, default=0.0)
    last_updated = Column(DateTime, default=func.now(), onupdate=func.now())
    
    # Relationships
    goal = relationship("Goal", back_populates="holdings")
    
    def __repr__(self):
        return f"<Holding(id={self.id}, goal={self.goal_id}, {self.quantity} {self.stock_symbol} @ avg {self.avg_buy_price})>"


class StockPrice(Base):
    """Cached stock price data."""
    __tablename__ = "stock_prices"
    
    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String(20), nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)
    open = Column(Float)
    high = Column(Float)
    low = Column(Float)
    close = Column(Float)
    adj_close = Column(Float)
    volume = Column(BigInteger)
    fetched_at = Column(DateTime, default=func.now())
    
    def __repr__(self):
        return f"<StockPrice({self.symbol} {self.date}: O={self.open} H={self.high} L={self.low} C={self.close})>"


class Alert(Base):
    """User alerts and notifications."""
    __tablename__ = "alerts"
    
    id = Column(Integer, primary_key=True, index=True)
    goal_id = Column(Integer, ForeignKey("goals.id"), nullable=False)
    alert_type = Column(String(50), nullable=False)  # goal_progress, risk_warning, rebalance, market_impact
    title = Column(String(200), nullable=False)
    message = Column(String(1000))
    severity = Column(String(20), default="info")  # info, warning, critical
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=func.now())
    
    def __repr__(self):
        return f"<Alert(id={self.id}, type='{self.alert_type}', title='{self.title}')>"
