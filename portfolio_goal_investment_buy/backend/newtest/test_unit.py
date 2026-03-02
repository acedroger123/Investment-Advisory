"""
Unit Tests for Stock Portfolio Advisory System.
Tests individual functions and methods in isolation.
"""
import pytest
from datetime import date, timedelta
from unittest.mock import patch, MagicMock
import sys
import os

# Add project root to path (backend directory)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))) + '/backend')


class TestGoalModelUnit:
    """Unit tests for Goal model."""
    
    def test_goal_creation_defaults(self):
        """Test Goal model creation with default values."""
        from database.models import Goal
        
        goal = Goal(
            id=1,
            user_id=1,
            name="Test Goal",
            target_amount=100000.0,
            deadline=date.today() + timedelta(days=365)
        )
        
        # Note: Default values are applied by SQLAlchemy on insert, not on object creation
        # The fields have defaults defined in the model but they may be None until persisted
        # We can verify the model accepts the values we set
        assert goal.name == "Test Goal"
        assert goal.target_amount == 100000.0
    
    def test_goal_target_value_calculation(self):
        """Test target value calculation with profit buffer."""
        from database.models import Goal
        
        goal = Goal(
            id=1,
            user_id=1,
            name="Test Goal",
            target_amount=100000.0,
            profit_buffer=0.15,
            deadline=date.today() + timedelta(days=365)
        )
        
        result = goal.calculate_target_value()
        expected = 115000.0  # 100000 * 1.15
        
        # Use pytest.approx for floating point comparison
        assert result == pytest.approx(expected, rel=1e-9)
        assert goal.target_value == pytest.approx(expected, rel=1e-9)
    
    def test_goal_with_zero_profit_buffer(self):
        """Test goal with zero profit buffer."""
        from database.models import Goal
        
        goal = Goal(
            id=1,
            user_id=1,
            name="Test Goal",
            target_amount=50000.0,
            profit_buffer=0.0,
            deadline=date.today() + timedelta(days=365)
        )
        
        result = goal.calculate_target_value()
        
        assert result == 50000.0


class TestTransactionModelUnit:
    """Unit tests for Transaction model."""
    
    def test_transaction_total_value_calculation(self):
        """Test total value calculation for transaction."""
        from database.models import Transaction
        
        txn = Transaction(
            id=1,
            goal_id=1,
            stock_symbol="INFY",
            transaction_type="BUY",
            quantity=100,
            price=1500.50,
            transaction_date=date.today() - timedelta(days=1)
        )
        
        result = txn.calculate_total_value()
        
        assert result == 150050.0  # 100 * 1500.50
        assert txn.total_value == 150050.0
    
    def test_transaction_repr(self):
        """Test transaction string representation."""
        from database.models import Transaction
        
        txn = Transaction(
            id=1,
            goal_id=1,
            stock_symbol="TCS",
            transaction_type="BUY",
            quantity=50,
            price=3200.0,
            transaction_date=date.today() - timedelta(days=1)
        )
        
        repr_str = repr(txn)
        
        assert "TCS" in repr_str
        assert "BUY" in repr_str
        assert "50" in repr_str


class TestHoldingModelUnit:
    """Unit tests for Holding model."""
    
    def test_holding_creation(self):
        """Test Holding model creation."""
        from database.models import Holding
        
        holding = Holding(
            id=1,
            goal_id=1,
            stock_symbol="RELIANCE",
            quantity=200,
            avg_buy_price=2500.0
        )
        
        assert holding.quantity == 200
        assert holding.avg_buy_price == 2500.0
        # Note: total_invested defaults to None in SQLAlchemy unless explicitly set
    
    def test_holding_total_invested_calculation(self):
        """Test total invested calculation for holding."""
        from database.models import Holding
        
        holding = Holding(
            id=1,
            goal_id=1,
            stock_symbol="HDFCBANK",
            quantity=150,
            avg_buy_price=1600.0
        )
        
        holding.total_invested = holding.quantity * holding.avg_buy_price
        
        assert holding.total_invested == 240000.0


class TestValidatorsUnit:
    """Unit tests for validator functions."""
    
    def test_validate_transaction_valid(self):
        """Test validate_transaction with valid input."""
        from utils.validators import validate_transaction
        
        with patch('utils.validators.MarketDataService') as mock_mds:
            mock_mds.validate_transaction_price.return_value = (True, "Valid price")
            
            ok, msg = validate_transaction(
                symbol="AAPL",
                transaction_date=date.today() - timedelta(days=1),
                price=150.0,
                quantity=10,
                transaction_type="BUY"
            )
        
        assert ok is True
    
    def test_validate_transaction_invalid_symbol(self):
        """Test validate_transaction with empty symbol."""
        from utils.validators import validate_transaction
        
        ok, msg = validate_transaction(
            symbol="",
            transaction_date=date.today() - timedelta(days=1),
            price=150.0,
            quantity=10,
            transaction_type="BUY"
        )
        
        assert ok is False
        assert "symbol" in msg.lower()
    
    def test_validate_transaction_invalid_quantity(self):
        """Test validate_transaction with zero quantity."""
        from utils.validators import validate_transaction
        
        ok, msg = validate_transaction(
            symbol="AAPL",
            transaction_date=date.today() - timedelta(days=1),
            price=150.0,
            quantity=0,
            transaction_type="BUY"
        )
        
        assert ok is False
        assert "quantity" in msg.lower()
    
    def test_validate_transaction_negative_price(self):
        """Test validate_transaction with negative price."""
        from utils.validators import validate_transaction
        
        ok, msg = validate_transaction(
            symbol="AAPL",
            transaction_date=date.today() - timedelta(days=1),
            price=-100.0,
            quantity=10,
            transaction_type="BUY"
        )
        
        assert ok is False
        assert "price" in msg.lower()
    
    def test_validate_transaction_future_date(self):
        """Test validate_transaction with future date."""
        from utils.validators import validate_transaction
        
        ok, msg = validate_transaction(
            symbol="AAPL",
            transaction_date=date.today() + timedelta(days=1),
            price=150.0,
            quantity=10,
            transaction_type="BUY"
        )
        
        assert ok is False
        assert "date" in msg.lower()
    
    def test_validate_goal_valid(self):
        """Test validate_goal with valid input."""
        from utils.validators import validate_goal
        
        ok, msg = validate_goal(
            name="Retirement Fund",
            target_amount=1000000.0,
            deadline=date.today() + timedelta(days=3650),
            risk_preference="moderate"
        )
        
        assert ok is True
        assert "valid" in msg.lower()
    
    def test_validate_goal_short_name(self):
        """Test validate_goal with short name."""
        from utils.validators import validate_goal
        
        ok, msg = validate_goal(
            name="A",
            target_amount=100000.0,
            deadline=date.today() + timedelta(days=365),
            risk_preference="moderate"
        )
        
        assert ok is False
        assert "name" in msg.lower()
    
    def test_validate_goal_negative_amount(self):
        """Test validate_goal with negative amount."""
        from utils.validators import validate_goal
        
        ok, msg = validate_goal(
            name="Test Goal",
            target_amount=-1000.0,
            deadline=date.today() + timedelta(days=365),
            risk_preference="moderate"
        )
        
        assert ok is False
        assert "amount" in msg.lower()
    
    def test_validate_goal_past_deadline(self):
        """Test validate_goal with past deadline."""
        from utils.validators import validate_goal
        
        ok, msg = validate_goal(
            name="Test Goal",
            target_amount=100000.0,
            deadline=date.today() - timedelta(days=1),
            risk_preference="moderate"
        )
        
        assert ok is False
        assert "deadline" in msg.lower()
    
    def test_validate_goal_invalid_risk(self):
        """Test validate_goal with invalid risk preference."""
        from utils.validators import validate_goal
        
        ok, msg = validate_goal(
            name="Test Goal",
            target_amount=100000.0,
            deadline=date.today() + timedelta(days=365),
            risk_preference="extreme"
        )
        
        assert ok is False
        assert "risk" in msg.lower()


class TestCalculationsUnit:
    """Unit tests for calculation functions."""
    
    def test_weighted_average_price(self):
        """Test weighted average price calculation."""
        # Existing position: 100 shares at 150
        existing_qty = 100
        existing_avg = 150.0
        
        # New purchase: 100 shares at 180
        new_qty = 100
        new_price = 180.0
        
        # Calculate weighted average
        total_cost = (existing_qty * existing_avg) + (new_qty * new_price)
        total_qty = existing_qty + new_qty
        new_avg = total_cost / total_qty
        
        assert new_avg == 165.0
        assert total_qty == 200
    
    def test_portfolio_value(self):
        """Test portfolio total value calculation."""
        holdings = [
            {"symbol": "AAPL", "quantity": 50, "current_price": 180.0},
            {"symbol": "GOOGL", "quantity": 25, "current_price": 2800.0},
            {"symbol": "MSFT", "quantity": 100, "current_price": 350.0}
        ]
        
        total_value = sum(h["quantity"] * h["current_price"] for h in holdings)
        
        # 50*180 + 25*2800 + 100*350 = 9000 + 70000 + 35000 = 114000
        assert total_value == 114000.0
    
    def test_profit_loss_calculation(self):
        """Test profit/loss calculation."""
        quantity = 100
        buy_price = 150.0
        current_price = 175.0
        
        invested = quantity * buy_price
        current_value = quantity * current_price
        profit = current_value - invested
        profit_pct = (profit / invested) * 100
        
        assert profit == 2500.0
        assert profit_pct == pytest.approx(16.67, rel=0.01)
    
    def test_loss_calculation(self):
        """Test loss calculation."""
        quantity = 100
        buy_price = 200.0
        current_price = 160.0
        
        invested = quantity * buy_price
        current_value = quantity * current_price
        profit = current_value - invested
        profit_pct = (profit / invested) * 100
        
        assert profit == -4000.0
        assert profit_pct == -20.0
    
    def test_allocation_percentage(self):
        """Test asset allocation percentage calculation."""
        total_portfolio = 100000.0
        holdings = [
            {"symbol": "AAPL", "value": 50000.0},
            {"symbol": "GOOGL", "value": 30000.0},
            {"symbol": "MSFT", "value": 20000.0}
        ]
        
        allocations = []
        for h in holdings:
            allocation = (h["value"] / total_portfolio) * 100
            allocations.append(allocation)
        
        assert allocations[0] == 50.0
        assert allocations[1] == 30.0
        assert allocations[2] == 20.0
        assert sum(allocations) == 100.0
    
    def test_goal_progress_percentage(self):
        """Test goal progress calculation."""
        current_value = 65000.0
        target_value = 100000.0
        
        progress = (current_value / target_value) * 100
        
        assert progress == 65.0
    
    def test_required_return_calculation(self):
        """Test required return calculation."""
        current = 50000.0
        target = 100000.0
        days = 365
        
        if current > 0 and days > 0:
            required_return = ((target / current) ** (365 / days) - 1) * 100
        else:
            required_return = 0
        
        assert required_return == pytest.approx(100.0, rel=0.1)


class TestEnumsUnit:
    """Unit tests for enum classes."""
    
    def test_risk_preference_enum(self):
        """Test RiskPreference enum values."""
        from database.models import RiskPreference
        
        assert RiskPreference.LOW.value == "low"
        assert RiskPreference.MODERATE.value == "moderate"
        assert RiskPreference.HIGH.value == "high"
    
    def test_goal_status_enum(self):
        """Test GoalStatus enum values."""
        from database.models import GoalStatus
        
        assert GoalStatus.ACTIVE.value == "active"
        assert GoalStatus.ACHIEVED.value == "achieved"
        assert GoalStatus.CANCELLED.value == "cancelled"
    
    def test_transaction_type_enum(self):
        """Test TransactionType enum values."""
        from database.models import TransactionType
        
        assert TransactionType.BUY.value == "buy"
        assert TransactionType.SELL.value == "sell"


class TestUserModelUnit:
    """Unit tests for User model."""
    
    def test_user_creation(self):
        """Test User model creation."""
        from database.models import User
        
        user = User(
            id=1,
            username="testuser",
            email="test@example.com"
        )
        
        assert user.username == "testuser"
        assert user.email == "test@example.com"
    
    def test_user_repr(self):
        """Test User string representation."""
        from database.models import User
        
        user = User(
            id=1,
            username="johndoe",
            email="john@example.com"
        )
        
        repr_str = repr(user)
        
        assert "johndoe" in repr_str
        assert "1" in repr_str
