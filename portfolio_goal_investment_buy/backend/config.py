"""
Configuration settings for the Stock Portfolio Advisory System.
"""
from pydantic_settings import BaseSettings
from pydantic import field_validator
from functools import lru_cache

class Settings(BaseSettings):
    """Application settings."""
    
    # Application
    APP_NAME: str = "Goal-Based Stock Portfolio Advisory System"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True
    
    # Database
    DATABASE_URL: str = "postgresql+psycopg2://postgres:root@localhost:5432/SignUp_SignIn_DB"
    
    # API Settings
    API_PREFIX: str = "/api"
    
    # Market Data Settings
    PRICE_CACHE_HOURS: int = 1  # How long to cache real-time prices
    DEFAULT_PROFIT_BUFFER: float = 0.10  # 10% profit buffer
    
    # Scheduler Settings
    SCHEDULER_ENABLED: bool = True  # Enable/disable background price updates
    PRICE_UPDATE_INTERVAL_MINUTES: int = 15  # How often to update stock prices
    
    # Monte Carlo Settings
    MC_SIMULATIONS: int = 1000
    MC_TRADING_DAYS_PER_YEAR: int = 252
    
    # Rebalancing Thresholds
    MAX_SINGLE_STOCK_WEIGHT: float = 0.30  # 30%
    REBALANCE_DRIFT_THRESHOLD: float = 0.05  # 5%

    @field_validator("DEBUG", mode="before")
    @classmethod
    def parse_debug(cls, value):
        if isinstance(value, bool):
            return value
        text = str(value or "").strip().lower()
        if text in {"1", "true", "yes", "on", "debug", "dev", "development"}:
            return True
        if text in {"0", "false", "no", "off", "release", "prod", "production"}:
            return False
        return False
    
    class Config:
        env_file = ".env"
        case_sensitive = True

@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()

settings = get_settings()
