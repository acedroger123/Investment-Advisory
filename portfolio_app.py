"""
Portfolio Analysis Engine - FastAPI Application
Integrated into the AI Wealth (Investment-Advisory) ecosystem.
Runs on port 8005 alongside the existing services.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from portfolio_backend.database import init_db
from portfolio_backend.routers import (
    goals_router,
    transactions_router,
    portfolio_router,
    stocks_router,
    recommendations_router,
    simulation_router
)
from portfolio_backend.services.scheduler import price_scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    # Startup
    print("🚀 Starting Portfolio Analysis Engine...")
    init_db()
    price_scheduler.start()
    yield
    # Shutdown
    print("👋 Shutting down Portfolio Analysis Engine...")
    price_scheduler.stop()


app = FastAPI(
    title="AI Wealth - Portfolio Analysis Engine",
    description="""
    Advanced portfolio analysis module for the AI Wealth platform.
    
    **Features:**
    - Goal Management with profit buffers
    - Stock Transaction Validation using historical OHLC data
    - Near Real-Time Portfolio Tracking
    - Portfolio Rebalancing Recommendations
    - Monte Carlo Simulation for goal feasibility
    - Stress Testing under adverse market conditions
    - Drawdown Analysis & Risk Metrics
    
    ⚠️ **Disclaimer**: This is an educational system for decision support only.
    """,
    version="1.0.0",
    lifespan=lifespan
)

# CORS configuration - allow the Node.js frontend on port 3000
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "*"],
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
        "name": "AI Wealth - Portfolio Analysis Engine",
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
    uvicorn.run("portfolio_app:app", host="0.0.0.0", port=8005, reload=True)
