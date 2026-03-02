"""
Goal-Based Stock Portfolio Advisory System
FastAPI Application Entry Point
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from database.db import init_db
from routers import (
    goals_router,
    transactions_router,
    portfolio_router,
    stocks_router,
    recommendations_router,
    simulation_router
)
from services.scheduler import price_scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    # Startup
    print("🚀 Starting Goal-Based Stock Portfolio Advisory System...")
    init_db()
    price_scheduler.start()
    yield
    # Shutdown
    print("👋 Shutting down...")
    price_scheduler.stop()


app = FastAPI(
    title="Goal-Based Stock Portfolio Advisory System",
    description="""
    A goal-oriented investment advisory platform that helps users plan, 
    monitor, and rebalance their stock portfolios to achieve real-life 
    financial goals.
    
    **Features:**
    - Goal Management with profit buffers
    - Stock Transaction Validation using historical OHLC data
    - Near Real-Time Portfolio Tracking
    - Portfolio Rebalancing Recommendations
    - Monte Carlo Simulation for goal feasibility
    - Stress Testing under adverse market conditions
    
    ⚠️ **Disclaimer**: This is an educational system for decision support only.
    It does not provide financial advice or execute trades.
    """,
    version="1.0.0",
    lifespan=lifespan
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(goals_router, prefix="/api")
app.include_router(transactions_router, prefix="/api")
app.include_router(portfolio_router, prefix="/api")
app.include_router(stocks_router, prefix="/api")
app.include_router(recommendations_router, prefix="/api")
app.include_router(simulation_router, prefix="/api")


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "name": "Goal-Based Stock Portfolio Advisory System",
        "version": "1.0.0",
        "status": "running",
        "docs": "/docs",
        "disclaimer": "This is an educational system. It does not provide financial advice."
    }


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}


@app.get("/scheduler/status")
async def scheduler_status():
    """Get the stock price scheduler status."""
    return price_scheduler.get_status()


@app.post("/scheduler/run-now")
async def scheduler_run_now():
    """Manually trigger a stock price update."""
    return await price_scheduler.run_update_now()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
