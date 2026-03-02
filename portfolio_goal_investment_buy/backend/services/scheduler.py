"""
Scheduler Service - Background job for updating stock prices.
Uses APScheduler for periodic price updates.
"""
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from datetime import datetime
from typing import Optional, Dict, List
import logging

from config import settings
from database.db import SessionLocal
from database.models import Holding
from services.market_data import MarketDataService

logger = logging.getLogger(__name__)


class PriceUpdateScheduler:
    """Background scheduler for updating stock prices."""
    
    def __init__(self):
        self.scheduler: Optional[AsyncIOScheduler] = None
        self.last_run: Optional[datetime] = None
        self.last_update_count: int = 0
        self.last_updated_symbols: List[str] = []
        self.is_running: bool = False
    
    def start(self):
        """Start the background scheduler."""
        if not settings.SCHEDULER_ENABLED:
            logger.info("📊 Stock price scheduler is disabled in config")
            return
        
        self.scheduler = AsyncIOScheduler()
        self.scheduler.add_job(
            self._update_prices_job,
            trigger=IntervalTrigger(minutes=settings.PRICE_UPDATE_INTERVAL_MINUTES),
            id="price_update_job",
            name="Update Portfolio Stock Prices",
            replace_existing=True
        )
        self.scheduler.start()
        self.is_running = True
        logger.info(
            f"📊 Started stock price scheduler (every {settings.PRICE_UPDATE_INTERVAL_MINUTES} minutes)"
        )
        print(f"📊 Started stock price scheduler (every {settings.PRICE_UPDATE_INTERVAL_MINUTES} minutes)")
    
    def stop(self):
        """Stop the background scheduler."""
        if self.scheduler and self.scheduler.running:
            self.scheduler.shutdown(wait=False)
            self.is_running = False
            logger.info("📊 Stopped stock price scheduler")
            print("📊 Stopped stock price scheduler")
    
    async def _update_prices_job(self):
        """Job to update prices for all portfolio stocks."""
        try:
            print(f"📊 Running scheduled price update at {datetime.now()}")
            
            # Get all unique stock symbols from per-goal holdings
            db = SessionLocal()
            try:
                holdings = db.query(Holding).filter(Holding.quantity > 0).all()
                symbols = list(set(h.stock_symbol for h in holdings))
            finally:
                db.close()
            
            if not symbols:
                print("📊 No stocks in portfolio to update")
                self.last_run = datetime.now()
                self.last_update_count = 0
                self.last_updated_symbols = []
                return
            
            # Update prices for each symbol
            updated_count = 0
            updated_symbols = []
            
            for symbol in symbols:
                try:
                    price = MarketDataService.get_current_price(symbol)
                    if price is not None:
                        updated_count += 1
                        updated_symbols.append(symbol)
                        print(f"  ✓ {symbol}: ₹{price:.2f}")
                    else:
                        print(f"  ✗ {symbol}: Failed to fetch price")
                except Exception as e:
                    print(f"  ✗ {symbol}: Error - {e}")
            
            self.last_run = datetime.now()
            self.last_update_count = updated_count
            self.last_updated_symbols = updated_symbols
            
            print(f"📊 Price update complete: {updated_count}/{len(symbols)} stocks updated")
            
        except Exception as e:
            logger.error(f"Error in price update job: {e}")
            print(f"📊 Error in price update: {e}")
    
    async def run_update_now(self) -> Dict:
        """Manually trigger a price update."""
        await self._update_prices_job()
        return self.get_status()
    
    def get_status(self) -> Dict:
        """Get scheduler status information."""
        next_run = None
        if self.scheduler and self.scheduler.running:
            job = self.scheduler.get_job("price_update_job")
            if job and job.next_run_time:
                next_run = job.next_run_time.isoformat()
        
        return {
            "enabled": settings.SCHEDULER_ENABLED,
            "running": self.is_running,
            "interval_minutes": settings.PRICE_UPDATE_INTERVAL_MINUTES,
            "last_run": self.last_run.isoformat() if self.last_run else None,
            "next_run": next_run,
            "last_update_count": self.last_update_count,
            "last_updated_symbols": self.last_updated_symbols
        }


# Singleton instance
price_scheduler = PriceUpdateScheduler()
