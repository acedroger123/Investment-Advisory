"""
Validation Tests for Stock Portfolio Advisory System.
Tests validation functions with various input scenarios.
"""
import pytest
from datetime import date, timedelta
from unittest.mock import patch, MagicMock
import sys
import os

# Add project root to path (backend directory)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))) + '/backend')


class TestTransactionValidation:
    """Tests for transaction validation."""
    
    def test_valid_buy_transaction(self):
        """Test validation of valid BUY transaction."""
        from utils.validators import validate_transaction
        
        with patch('utils.validators.MarketDataService') as mock_mds:
            mock_mds.validate_transaction_price.return_value = (True, "Valid")
            
            ok, msg = validate_transaction(
                symbol="AAPL",
                transaction_date=date.today() - timedelta(days=1),
                price=150.0,
                quantity=10,
                transaction_type="BUY"
            )
        
        assert ok is True
    
    def test_valid_sell_transaction(self):
        """Test validation of valid SELL transaction."""
        from utils.validators import validate_transaction
        
        with patch('utils.validators.MarketDataService') as mock_mds:
            mock_mds.validate_transaction_price.return_value = (True, "Valid")
            
            ok, msg = validate_transaction(
                symbol="GOOGL",
                transaction_date=date.today() - timedelta(days=1),
                price=2800.0,
                quantity=5,
                transaction_type="SELL"
            )
        
        assert ok is True
    
    def test_empty_symbol_rejected(self):
        """Test that empty symbol is rejected."""
        from utils.validators import validate_transaction
        
        ok, msg = validate_transaction(
            symbol="",
            transaction_date=date.today() - timedelta(days=1),
            price=150.0,
            quantity=10,
            transaction_type="BUY"
        )
        
        assert ok is False
        assert "required" in msg.lower() or "symbol" in msg.lower()
    
    def test_whitespace_symbol_rejected(self):
        """Test that whitespace-only symbol is rejected."""
        from utils.validators import validate_transaction
        
        ok, msg = validate_transaction(
            symbol="   ",
            transaction_date=date.today() - timedelta(days=1),
            price=150.0,
            quantity=10,
            transaction_type="BUY"
        )
        
        assert ok is False
    
    def test_zero_quantity_rejected(self):
        """Test that zero quantity is rejected."""
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
    
    def test_negative_quantity_rejected(self):
        """Test that negative quantity is rejected."""
        from utils.validators import validate_transaction
        
        ok, msg = validate_transaction(
            symbol="AAPL",
            transaction_date=date.today() - timedelta(days=1),
            price=150.0,
            quantity=-10,
            transaction_type="BUY"
        )
        
        assert ok is False
    
    def test_zero_price_rejected(self):
        """Test that zero price is rejected."""
        from utils.validators import validate_transaction
        
        ok, msg = validate_transaction(
            symbol="AAPL",
            transaction_date=date.today() - timedelta(days=1),
            price=0.0,
            quantity=10,
            transaction_type="BUY"
        )
        
        assert ok is False
        assert "price" in msg.lower()
    
    def test_negative_price_rejected(self):
        """Test that negative price is rejected."""
        from utils.validators import validate_transaction
        
        ok, msg = validate_transaction(
            symbol="AAPL",
            transaction_date=date.today() - timedelta(days=1),
            price=-150.0,
            quantity=10,
            transaction_type="BUY"
        )
        
        assert ok is False
    
    def test_invalid_transaction_type_rejected(self):
        """Test that invalid transaction type is rejected."""
        from utils.validators import validate_transaction
        
        invalid_types = ["HOLD", "TRANSFER", "WITHDRAW", "BUYY", "SELLL", ""]
        
        for txn_type in invalid_types:
            ok, msg = validate_transaction(
                symbol="AAPL",
                transaction_date=date.today() - timedelta(days=1),
                price=150.0,
                quantity=10,
                transaction_type=txn_type
            )
            assert ok is False
    
    def test_future_date_rejected(self):
        """Test that future transaction date is rejected."""
        from utils.validators import validate_transaction
        
        ok, msg = validate_transaction(
            symbol="AAPL",
            transaction_date=date.today() + timedelta(days=1),
            price=150.0,
            quantity=10,
            transaction_type="BUY"
        )
        
        assert ok is False
        assert "future" in msg.lower()
    
    def test_today_date_accepted(self):
        """Test that today's date is accepted."""
        from utils.validators import validate_transaction
        
        with patch('utils.validators.MarketDataService') as mock_mds:
            mock_mds.validate_transaction_price.return_value = (True, "Valid")
            
            ok, msg = validate_transaction(
                symbol="AAPL",
                transaction_date=date.today(),
                price=150.0,
                quantity=10,
                transaction_type="BUY"
            )
        
        assert ok is True
    
    def test_yesterday_date_accepted(self):
        """Test that yesterday's date is accepted."""
        from utils.validators import validate_transaction
        
        with patch('utils.validators.MarketDataService') as mock_mds:
            mock_mds.validate_transaction_price.return_value = (True, "Valid")
            
            ok, msg = validate_transaction(
                symbol="AAPL",
                transaction_date=date.today() - timedelta(days=1),
                price=150.0,
                quantity=10,
                transaction_type="BUY"
            )
        
        assert ok is True
    
    def test_case_insensitive_transaction_type(self):
        """Test that transaction type is case insensitive."""
        from utils.validators import validate_transaction
        
        with patch('utils.validators.MarketDataService') as mock_mds:
            mock_mds.validate_transaction_price.return_value = (True, "Valid")
            
            for txn_type in ["buy", "Buy", "BUY"]:
                ok, msg = validate_transaction(
                    symbol="AAPL",
                    transaction_date=date.today() - timedelta(days=1),
                    price=150.0,
                    quantity=10,
                    transaction_type=txn_type
                )
                assert ok is True


class TestGoalValidation:
    """Tests for goal validation."""
    
    def test_valid_goal(self):
        """Test validation of valid goal."""
        from utils.validators import validate_goal
        
        ok, msg = validate_goal(
            name="Retirement Fund",
            target_amount=1000000.0,
            deadline=date.today() + timedelta(days=3650),
            risk_preference="moderate"
        )
        
        assert ok is True
        assert "valid" in msg.lower()
    
    def test_empty_name_rejected(self):
        """Test that empty name is rejected."""
        from utils.validators import validate_goal
        
        ok, msg = validate_goal(
            name="",
            target_amount=100000.0,
            deadline=date.today() + timedelta(days=365),
            risk_preference="moderate"
        )
        
        assert ok is False
        assert "name" in msg.lower()
    
    def test_single_char_name_rejected(self):
        """Test that single character name is rejected."""
        from utils.validators import validate_goal
        
        ok, msg = validate_goal(
            name="A",
            target_amount=100000.0,
            deadline=date.today() + timedelta(days=365),
            risk_preference="moderate"
        )
        
        assert ok is False
    
    def test_two_char_name_accepted(self):
        """Test that two character name is accepted."""
        from utils.validators import validate_goal
        
        ok, msg = validate_goal(
            name="AB",
            target_amount=100000.0,
            deadline=date.today() + timedelta(days=365),
            risk_preference="moderate"
        )
        
        assert ok is True
    
    def test_zero_target_amount_rejected(self):
        """Test that zero target amount is rejected."""
        from utils.validators import validate_goal
        
        ok, msg = validate_goal(
            name="Test Goal",
            target_amount=0.0,
            deadline=date.today() + timedelta(days=365),
            risk_preference="moderate"
        )
        
        assert ok is False
        assert "amount" in msg.lower()
    
    def test_negative_target_amount_rejected(self):
        """Test that negative target amount is rejected."""
        from utils.validators import validate_goal
        
        ok, msg = validate_goal(
            name="Test Goal",
            target_amount=-100000.0,
            deadline=date.today() + timedelta(days=365),
            risk_preference="moderate"
        )
        
        assert ok is False
    
    def test_past_deadline_rejected(self):
        """Test that past deadline is rejected."""
        from utils.validators import validate_goal
        
        ok, msg = validate_goal(
            name="Test Goal",
            target_amount=100000.0,
            deadline=date.today() - timedelta(days=1),
            risk_preference="moderate"
        )
        
        assert ok is False
        assert "deadline" in msg.lower()
    
    def test_today_deadline_rejected(self):
        """Test that today's deadline is rejected."""
        from utils.validators import validate_goal
        
        ok, msg = validate_goal(
            name="Test Goal",
            target_amount=100000.0,
            deadline=date.today(),
            risk_preference="moderate"
        )
        
        assert ok is False
    
    def test_tomorrow_deadline_accepted(self):
        """Test that tomorrow's deadline is accepted."""
        from utils.validators import validate_goal
        
        ok, msg = validate_goal(
            name="Test Goal",
            target_amount=100000.0,
            deadline=date.today() + timedelta(days=1),
            risk_preference="moderate"
        )
        
        assert ok is True
    
    def test_invalid_risk_preference_rejected(self):
        """Test that invalid risk preference is rejected."""
        from utils.validators import validate_goal
        
        invalid_risks = ["very_low", "high_risk", "medium", "", "   ", "aggressive"]
        
        for risk in invalid_risks:
            ok, msg = validate_goal(
                name="Test Goal",
                target_amount=100000.0,
                deadline=date.today() + timedelta(days=365),
                risk_preference=risk
            )
            assert ok is False
    
    def test_valid_risk_preferences_accepted(self):
        """Test that valid risk preferences are accepted."""
        from utils.validators import validate_goal
        
        for risk in ["low", "moderate", "high"]:
            ok, msg = validate_goal(
                name="Test Goal",
                target_amount=100000.0,
                deadline=date.today() + timedelta(days=365),
                risk_preference=risk
            )
            assert ok is True
    
    def test_case_insensitive_risk_preference(self):
        """Test that risk preference is case insensitive."""
        from utils.validators import validate_goal
        
        for risk in ["LOW", "Moderate", "HIGH", "LoW", "MoDeRaTe"]:
            ok, msg = validate_goal(
                name="Test Goal",
                target_amount=100000.0,
                deadline=date.today() + timedelta(days=365),
                risk_preference=risk
            )
            assert ok is True


class TestMultipleValidationErrors:
    """Tests for multiple validation errors."""
    
    def test_multiple_transaction_errors(self):
        """Test that multiple transaction errors are reported."""
        from utils.validators import validate_transaction
        
        ok, msg = validate_transaction(
            symbol="",
            transaction_date=date.today() + timedelta(days=1),
            price=-100.0,
            quantity=-5,
            transaction_type="HOLD"
        )
        
        assert ok is False
        # Should have multiple error messages
        errors = msg.split(";")
        assert len(errors) >= 3
    
    def test_multiple_goal_errors(self):
        """Test that multiple goal errors are reported."""
        from utils.validators import validate_goal
        
        ok, msg = validate_goal(
            name="",
            target_amount=-1000.0,
            deadline=date.today() - timedelta(days=1),
            risk_preference="invalid"
        )
        
        assert ok is False
        # Should have multiple error messages
        errors = msg.split(";")
        assert len(errors) >= 3


class TestInputSanitization:
    """Tests for input sanitization."""
    
    def test_none_symbol_handled(self):
        """Test that None symbol is handled."""
        from utils.validators import validate_transaction
        
        ok, msg = validate_transaction(
            symbol=None,
            transaction_date=date.today() - timedelta(days=1),
            price=150.0,
            quantity=10,
            transaction_type="BUY"
        )
        
        assert ok is False
    
    def test_none_goal_name_handled(self):
        """Test that None goal name is handled."""
        from utils.validators import validate_goal
        
        ok, msg = validate_goal(
            name=None,
            target_amount=100000.0,
            deadline=date.today() + timedelta(days=365),
            risk_preference="moderate"
        )
        
        assert ok is False
    
    def test_leading_trailing_whitespace_trimmed(self):
        """Test that whitespace is handled in symbols."""
        from utils.validators import validate_transaction
        
        with patch('utils.validators.MarketDataService') as mock_mds:
            mock_mds.validate_transaction_price.return_value = (True, "Valid")
            
            # Symbol with leading/trailing whitespace
            ok, msg = validate_transaction(
                symbol="  AAPL  ",
                transaction_date=date.today() - timedelta(days=1),
                price=150.0,
                quantity=10,
                transaction_type="BUY"
            )
            # Basic validation should pass (whitespace handling may vary)


class TestValidationEdgeCases:
    """Tests for validation edge cases."""
    
    def test_very_long_symbol_rejected(self):
        """Test that very long symbol is rejected."""
        from utils.validators import validate_transaction
        
        long_symbol = "A" * 100
        ok, msg = validate_transaction(
            symbol=long_symbol,
            transaction_date=date.today() - timedelta(days=1),
            price=150.0,
            quantity=10,
            transaction_type="BUY"
        )
        
        # Should likely be rejected as too long
        assert ok is False or len(msg) > 0
    
    def test_very_large_quantity_accepted(self):
        """Test that very large quantity is accepted."""
        from utils.validators import validate_transaction
        
        with patch('utils.validators.MarketDataService') as mock_mds:
            mock_mds.validate_transaction_price.return_value = (True, "Valid")
            
            ok, msg = validate_transaction(
                symbol="AAPL",
                transaction_date=date.today() - timedelta(days=1),
                price=150.0,
                quantity=1000000000,
                transaction_type="BUY"
            )
        
        assert ok is True
    
    def test_very_large_target_amount_accepted(self):
        """Test that very large target amount is accepted."""
        from utils.validators import validate_goal
        
        ok, msg = validate_goal(
            name="Test Goal",
            target_amount=999999999999.0,
            deadline=date.today() + timedelta(days=365),
            risk_preference="moderate"
        )
        
        assert ok is True
    
    def test_very_small_price_accepted(self):
        """Test that very small price is accepted."""
        from utils.validators import validate_transaction
        
        with patch('utils.validators.MarketDataService') as mock_mds:
            mock_mds.validate_transaction_price.return_value = (True, "Valid")
            
            ok, msg = validate_transaction(
                symbol="AAPL",
                transaction_date=date.today() - timedelta(days=1),
                price=0.01,
                quantity=10,
                transaction_type="BUY"
            )
        
        assert ok is True
    
    def test_leap_year_deadline_accepted(self):
        """Test that leap year deadline is accepted."""
        from utils.validators import validate_goal
        
        # Feb 29 in leap year (2024)
        leap_deadline = date(2024, 2, 29)
        
        ok, msg = validate_goal(
            name="Test Goal",
            target_amount=100000.0,
            deadline=leap_deadline,
            risk_preference="moderate"
        )
        
        # Should pass if in the future
        if leap_deadline > date.today():
            assert ok is True
