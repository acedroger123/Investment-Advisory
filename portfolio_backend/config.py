"""
Configuration settings for the Portfolio Analysis Backend.
Integrated into the Investment-Advisory ecosystem.
Uses the SAME PostgreSQL database as the Node.js server.
"""
from pydantic_settings import BaseSettings
from functools import lru_cache
import os

class Settings(BaseSettings):
    """Application settings."""
    
    # Application
    APP_NAME: str = "AI Wealth - Portfolio Analysis Engine"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True
    
    # Database - PostgreSQL (same as Node.js server)
    DATABASE_URL: str = "postgresql://postgres:root@localhost:5432/SignUp_SignIn_DB"
    
    # API Settings
    API_PREFIX: str = "/api"
    
    # Market Data Settings
    PRICE_CACHE_HOURS: int = 1
    DEFAULT_PROFIT_BUFFER: float = 0.10  # 10% profit buffer
    
    # Scheduler Settings
    SCHEDULER_ENABLED: bool = True
    PRICE_UPDATE_INTERVAL_MINUTES: int = 15
    
    # Monte Carlo Settings
    MC_SIMULATIONS: int = 1000
    MC_TRADING_DAYS_PER_YEAR: int = 252
    
    # Rebalancing Thresholds
    MAX_SINGLE_STOCK_WEIGHT: float = 0.30  # 30%
    REBALANCE_DRIFT_THRESHOLD: float = 0.05  # 5%
    
    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "ignore"

@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()

settings = get_settings()
