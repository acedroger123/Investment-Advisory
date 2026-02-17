"""Routers package."""
from .goals import router as goals_router
from .transactions import router as transactions_router
from .portfolio import router as portfolio_router
from .stocks import router as stocks_router
from .recommendations import router as recommendations_router
from .simulation import router as simulation_router

__all__ = [
    "goals_router",
    "transactions_router",
    "portfolio_router",
    "stocks_router",
    "recommendations_router",
    "simulation_router"
]
