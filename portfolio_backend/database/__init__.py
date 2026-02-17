"""
Database connection and session management for Portfolio Analysis.
Uses PostgreSQL — the same database as the Node.js server.
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

from portfolio_backend.config import settings

# PostgreSQL connection — uses the same SignUp_SignIn_DB as server.js
DATABASE_URL = settings.DATABASE_URL

# Create engine for PostgreSQL
engine = create_engine(
    DATABASE_URL,
    pool_size=5,
    max_overflow=10,
    pool_pre_ping=True,  # Verify connections before using them
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
    Initialize the database by verifying tables exist.
    Tables are created via SQL migration, not auto-create.
    Called on application startup.
    """
    from . import models  # Import models to register them
    # Verify connection works
    try:
        with engine.connect() as conn:
            result = conn.execute(
                __import__('sqlalchemy').text(
                    "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'pa_%'"
                )
            )
            tables = [row[0] for row in result]
            print(f"✅ PostgreSQL connected! Portfolio tables found: {', '.join(tables)}")
            if len(tables) < 5:
                print("⚠️  Some pa_* tables may be missing. Run _create_tables.js first.")
    except Exception as e:
        print(f"❌ PostgreSQL connection failed: {e}")
        raise
