"""
Database connection and session management.
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.pool import StaticPool
import os

# Create data directory if it doesn't exist
os.makedirs("data", exist_ok=True)

# SQLite database URL
DATABASE_URL = "sqlite:///./data/stocks.db"

# Create engine with SQLite-specific settings
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
    echo=False  # Set to True for SQL debugging
)

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for models
Base = declarative_base()

def get_db():
    """
    Dependency that provides a database session.
    Yields a session and ensures it's closed after use.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    """
    Initialize the database by creating all tables.
    Called on application startup.
    """
    from . import models  # Import models to register them
    Base.metadata.create_all(bind=engine)
    print("✅ Database initialized successfully!")
