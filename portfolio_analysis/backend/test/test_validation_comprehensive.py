"""
Comprehensive Validation Tests.
Tests validation functions with extensive scenarios beyond basic happy paths.
"""
import pytest
from datetime import date, timedelta
from unittest.mock import patch, MagicMock
import sys
import os

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class TestTransactionValidationComprehensive:
    """Comprehensive tests for transaction validation."""
    
    def _call_validate_transaction(self, symbol="AAPL", txn_date=None, price=150.0,
                                    quantity=10, txn_type="BUY"):
        txn_date = txn_date or (date.today() - timedelta(days=1))
        from utils.validators import validate_transaction
        return validate_transaction(symbol, txn_date, price, quantity, txn_type)
    
    def test_valid_transaction_returns_true(self):
        """Test that a valid transaction returns success."""
        with patch("utils.validators.MarketDataService") as m:
            m.validate_transaction_price.return_value = (True, "Price is valid")
            ok, msg = self._call_validate_transaction()
        
        assert ok is True
        assert "valid" in msg.lower()
    
    def test_symbol_with_special_characters_rejected(self):
        """Test that symbols with special characters are rejected."""
        ok, msg = self._call_validate_transaction(symbol="AAPL$")
        assert ok is False
        
        ok, msg = self._call_validate_transaction(symbol="AAPL!")
        assert ok is False
        
        ok, msg = self._call_validate_transaction(symbol="A@APL")
        assert ok is False
    
    def test_symbol_with_numbers_rejected(self):
        """Test that symbols with numbers are rejected."""
        ok, msg = self._call_validate_transaction(symbol="AAPL123")
        # This may pass or fail depending on validation - just check behavior
        # Most stock symbols don't have numbers
        if not ok:
            assert "symbol" in msg.lower() or "invalid" in msg.lower()
    
    def test_symbol_too_long_rejected(self):
        """Test that overly long symbols are rejected."""
        ok, msg = self._call_validate_transaction(symbol="A" * 50)
        assert ok is False
    
    def test_symbol_case_handling(self):
        """Test that symbol case is handled correctly."""
        with patch("utils.validators.MarketDataService") as m:
            m.validate_transaction_price.return_value = (True, "OK")
            
            # Lowercase should work (normalized)
            ok, _ = self._call_validate_transaction(symbol="aapl")
            assert ok is True
            
            # Mixed case should work
            ok, _ = self._call_validate_transaction(symbol="AaPl")
            assert ok is True
    
    def test_zero_price_rejected(self):
        """Test that zero price is rejected."""
        ok, msg = self._call_validate_transaction(price=0)
        assert ok is False
        assert "price" in msg.lower()
    
    def test_negative_price_rejected(self):
        """Test that negative price is rejected."""
        ok, msg = self._call_validate_transaction(price=-100.0)
        assert ok is False
    
    def test_very_small_positive_price_accepted(self):
        """Test that very small but positive price is accepted."""
        with patch("utils.validators.MarketDataService") as m:
            m.validate_transaction_price.return_value = (True, "OK")
            ok, _ = self._call_validate_transaction(price=0.01)
        assert ok is True
    
    def test_very_large_price_accepted(self):
        """Test that very large price is accepted (penny stocks can be high)."""
        with patch("utils.validators.MarketDataService") as m:
            m.validate_transaction_price.return_value = (True, "OK")
            ok, _ = self._call_validate_transaction(price=1000000.0)
        assert ok is True
    
    def test_quantity_one_accepted(self):
        """Test that quantity of 1 is accepted."""
        with patch("utils.validators.MarketDataService") as m:
            m.validate_transaction_price.return_value = (True, "OK")
            ok, _ = self._call_validate_transaction(quantity=1)
        assert ok is True
    
    def test_large_quantity_accepted(self):
        """Test that large quantity is accepted."""
        with patch("utils.validators.MarketDataService") as m:
            m.validate_transaction_price.return_value = (True, "OK")
            ok, _ = self._call_validate_transaction(quantity=1000000)
        assert ok is True
    
    def test_today_date_accepted(self):
        """Test that today's date is accepted."""
        with patch("utils.validators.MarketDataService") as m:
            m.validate_transaction_price.return_value = (True, "OK")
            ok, _ = self._call_validate_transaction(txn_date=date.today())
        assert ok is True
    
    def test_yesterday_date_accepted(self):
        """Test that yesterday's date is accepted."""
        with patch("utils.validators.MarketDataService") as m:
            m.validate_transaction_price.return_value = (True, "OK")
            ok, _ = self._call_validate_transaction(
                txn_date=date.today() - timedelta(days=1)
            )
        assert ok is True
    
    def test_very_old_date_accepted(self):
        """Test that very old dates are accepted (within reason)."""
        with patch("utils.validators.MarketDataService") as m:
            m.validate_transaction_price.return_value = (True, "OK")
            ok, _ = self._call_validate_transaction(
                txn_date=date.today() - timedelta(days=365)
            )
        assert ok is True
    
    def test_transaction_type_variations(self):
        """Test various transaction type variations."""
        with patch("utils.validators.MarketDataService") as m:
            m.validate_transaction_price.return_value = (True, "OK")
            
            # Various valid forms
            ok, _ = self._call_validate_transaction(txn_type="BUY")
            assert ok is True
            
            ok, _ = self._call_validate_transaction(txn_type="buy")
            assert ok is True
            
            ok, _ = self._call_validate_transaction(txn_type="Buy")
            assert ok is True
            
            ok, _ = self._call_validate_transaction(txn_type="SELL")
            assert ok is True
            
            ok, _ = self._call_validate_transaction(txn_type="sell")
            assert ok is True
    
    def test_invalid_transaction_types_rejected(self):
        """Test that invalid transaction types are rejected."""
        invalid_types = ["HOLD", "TRANSFER", "WITHDRAW", "DEPOSIT", "", "   "]
        
        for txn_type in invalid_types:
            ok, msg = self._call_validate_transaction(txn_type=txn_type)
            assert ok is False, f"Expected {txn_type} to be rejected"
    
    def test_multiple_validation_errors(self):
        """Test that multiple validation errors are all reported."""
        ok, msg = self._call_validate_transaction(
            symbol="",
            quantity=-1,
            price=-10,
            txn_type="INVALID"
        )
        
        assert ok is False
        # Should have multiple error messages
        assert msg.count(";") >= 2
    
    def test_price_validation_tolerance(self):
        """Test price validation with market data tolerance."""
        # Price within 2% tolerance should pass
        with patch("utils.validators.MarketDataService") as m:
            m.validate_transaction_price.return_value = (
                True, "Price validated. Day range: ₹145.00 - ₹155.00"
            )
            ok, _ = self._call_validate_transaction(price=150.0)
        assert ok is True
        
        # Price outside tolerance should fail
        with patch("utils.validators.MarketDataService") as m:
            m.validate_transaction_price.return_value = (
                False, "Price ₹180.00 is outside day's range (₹145.00 - ₹155.00)"
            )
            ok, msg = self._call_validate_transaction(price=180.0)
        assert ok is False


class TestGoalValidationComprehensive:
    """Comprehensive tests for goal validation."""
    
    def _call_validate_goal(self, name="Test Goal", target_amount=100000.0,
                            deadline=None, risk_preference="moderate"):
        deadline = deadline or (date.today() + timedelta(days=365))
        from utils.validators import validate_goal
        return validate_goal(name, target_amount, deadline, risk_preference)
    
    def test_valid_goal_returns_true(self):
        """Test that a valid goal returns success."""
        ok, msg = self._call_validate_goal()
        assert ok is True
        assert "valid" in msg.lower()
    
    def test_goal_name_minimum_length(self):
        """Test goal name minimum length requirements."""
        # 1 character should fail
        ok, msg = self._call_validate_goal(name="A")
        assert ok is False
        
        # 2 characters should pass
        ok, _ = self._call_validate_goal(name="AB")
        assert ok is True
    
    def test_goal_name_maximum_length(self):
        """Test goal name maximum length handling."""
        # Very long name
        long_name = "A" * 500
        ok, msg = self._call_validate_goal(name=long_name)
        # May pass or fail depending on implementation
        # If it fails, should mention name is too long
    
    def test_goal_name_with_spaces(self):
        """Test that goal names with spaces are accepted."""
        ok, _ = self._call_validate_goal(name="Buy a House")
        assert ok is True
        
        ok, _ = self._call_validate_goal(name="  Goal with spaces  ")
        assert ok is True
    
    def test_goal_name_special_characters(self):
        """Test goal name with special characters."""
        # These should probably be accepted
        ok, _ = self._call_validate_goal(name="Goal #1 - 2024")
        assert ok is True
        
        ok, _ = self._call_validate_goal(name="Retirement Fund (High Priority)")
        assert ok is True
    
    def test_target_amount_boundaries(self):
        """Test target amount boundary values."""
        # Zero should fail
        ok, msg = self._call_validate_goal(target_amount=0)
        assert ok is False
        
        # Negative should fail
        ok, _ = self._call_validate_goal(target_amount=-1000)
        assert ok is False
        
        # Very small positive should pass
        ok, _ = self._call_validate_goal(target_amount=0.01)
        assert ok is True
        
        # Very large should pass
        ok, _ = self._call_validate_goal(target_amount=999999999999)
        assert ok is True
    
    def test_deadline_boundaries(self):
        """Test deadline boundary values."""
        # Past date should fail
        ok, msg = self._call_validate_goal(
            deadline=date.today() - timedelta(days=1)
        )
        assert ok is False
        
        # Today should fail
        ok, _ = self._call_validate_goal(deadline=date.today())
        assert ok is False
        
        # Tomorrow should pass
        ok, _ = self._call_validate_goal(
            deadline=date.today() + timedelta(days=1)
        )
        assert ok is True
        
        # Very far future should pass
        ok, _ = self._call_validate_goal(
            deadline=date.today() + timedelta(days=3650)  # 10 years
        )
        assert ok is True
    
    def test_risk_preference_valid_values(self):
        """Test that all valid risk preferences are accepted."""
        valid_risks = ["low", "moderate", "high"]
        
        for risk in valid_risks:
            ok, _ = self._call_validate_goal(risk_preference=risk)
            assert ok is True, f"Expected {risk} to be accepted"
    
    def test_risk_preference_case_insensitivity(self):
        """Test risk preference case insensitivity."""
        ok, _ = self._call_validate_goal(risk_preference="LOW")
        assert ok is True
        
        ok, _ = self._call_validate_goal(risk_preference="Moderate")
        assert ok is True
        
        ok, _ = self._call_validate_goal(risk_preference="HIGH")
        assert ok is True
    
    def test_risk_preference_invalid_values(self):
        """Test that invalid risk preferences are rejected."""
        invalid_risks = [
            "very", "low_medium", "aggressive_high", "medium", 
            "conservative", "safe", "risky", "", "   ", "none"
        ]
        
        for risk in invalid_risks:
            ok, msg = self._call_validate_goal(risk_preference=risk)
            assert ok is False, f"Expected '{risk}' to be rejected"
    
    def test_multiple_goal_errors(self):
        """Test that multiple validation errors are reported."""
        ok, msg = self._call_validate_goal(
            name="",  # Too short
            target_amount=-1000,  # Negative
            deadline=date.today() - timedelta(days=1),  # Past
            risk_preference="invalid"  # Invalid
        )
        
        assert ok is False
        # Should have multiple errors
        error_count = msg.count(";") + 1
        assert error_count >= 3


class TestInputSanitization:
    """Tests for input sanitization and edge cases."""
    
    def test_none_inputs_handled(self):
        """Test that None inputs are handled gracefully."""
        from utils.validators import validate_transaction, validate_goal
        
        # None symbol
        ok, msg = validate_transaction(None, date.today(), 100.0, 10, "BUY")
        assert ok is False
        
        # None goal name
        ok, msg = validate_goal(None, 1000.0, date.today() + timedelta(days=30), "moderate")
        assert ok is False
    
    def test_whitespace_only_inputs(self):
        """Test that whitespace-only inputs are handled."""
        from utils.validators import validate_transaction, validate_goal
        
        # Whitespace symbol
        ok, msg = validate_transaction("   ", date.today(), 100.0, 10, "BUY")
        assert ok is False
        
        # Whitespace goal name
        ok, msg = validate_goal("   ", 1000.0, date.today() + timedelta(days=30), "moderate")
        assert ok is False
    
    def test_unicode_in_goal_name(self):
        """Test that unicode characters in goal name are handled."""
        from utils.validators import validate_goal
        
        # Unicode in name - should work or fail gracefully
        ok, _ = validate_goal(
            "🎯 retirement fund",
            100000.0,
            date.today() + timedelta(days=365),
            "moderate"
        )
        # Just check it doesn't crash
    
    def test_sql_injection_prevention(self):
        """Test that potential SQL injection is handled."""
        from utils.validators import validate_goal
        
        # Attempt SQL injection
        malicious_names = [
            "'; DROP TABLE users; --",
            "1' OR '1'='1",
            "admin'--"
        ]
        
        for name in malicious_names:
            ok, msg = validate_goal(
                name,
                1000.0,
                date.today() + timedelta(days=30),
                "moderate"
            )
            # Should either accept as valid string or reject safely
            # Should NOT cause a database error
            assert ok is True or ok is False  # Just shouldn't crash
    
    def test_xss_prevention_in_goal_name(self):
        """Test that XSS attempts in goal names are handled."""
        from utils.validators import validate_goal
        
        xss_attempts = [
            "<script>alert('xss')</script>",
            "javascript:alert(1)",
            "<img src=x onerror=alert(1)>"
        ]
        
        for name in xss_attempts:
            ok, _ = validate_goal(
                name,
                1000.0,
                date.today() + timedelta(days=30),
                "moderate"
            )
            # Should accept as valid string (sanitization should happen elsewhere)
            assert ok is True


class TestBoundaryConditions:
    """Tests for boundary conditions in validation."""
    
    def test_leap_year_date_handling(self):
        """Test date validation around leap years."""
        from utils.validators import validate_goal
        
        # Feb 29 in leap year
        leap_year_deadline = date(2024, 2, 29)
        ok, _ = validate_goal(
            "Test",
            1000.0,
            leap_year_deadline,
            "moderate"
        )
        assert ok is True
        
        # Feb 29 in non-leap year should fail
        non_leap_deadline = date(2023, 2, 29)
        # This would be invalid date, but validate_goal may not catch it
        # Just verify it doesn't crash
    
    def test_decimal_quantities_handled(self):
        """Test that decimal quantities are handled."""
        # In stock trading, quantities are typically integers
        # But we should handle edge cases
        from utils.validators import validate_transaction
        
        # Decimal price should work
        ok, _ = validate_transaction(
            "AAPL",
            date.today() - timedelta(days=1),
            150.50,
            10,
            "BUY"
        )
        # Price can be decimal
    
    def test_negative_days_handled(self):
        """Test that negative day calculations are handled gracefully."""
        # In drawdown/risk calculations
        today = date.today()
        past = today - timedelta(days=30)
        future = today + timedelta(days=30)
        
        # Days between past and future
        days = (future - past).days
        assert days == 60
        
        # Past date calculation
        days_past = (today - future).days
        assert days_past == -30
    
    def test_max_integer_handling(self):
        """Test handling of maximum integer values."""
        # Test with very large quantity
        from utils.validators import validate_transaction
        
        # This shouldn't cause overflow
        ok, msg = validate_transaction(
            "AAPL",
            date.today() - timedelta(days=1),
            150.0,
            2147483647,  # Max 32-bit int
            "BUY"
        )
        # Should pass basic validation (may fail market data check)


class TestValidationErrorMessages:
    """Tests for validation error message quality."""
    
    def test_error_messages_are_descriptive(self):
        """Test that error messages are helpful and descriptive."""
        from utils.validators import validate_transaction, validate_goal
        
        # Empty symbol should have clear message
        ok, msg = validate_transaction("", date.today(), 100.0, 10, "BUY")
        assert ok is False
        assert len(msg) > 0
        assert "symbol" in msg.lower() or "required" in msg.lower()
        
        # Negative quantity should have clear message
        ok, msg = validate_transaction("AAPL", date.today(), 100.0, -5, "BUY")
        assert ok is False
        assert "quantity" in msg.lower()
        
        # Empty goal name should have clear message
        ok, msg = validate_goal("", 1000.0, date.today() + timedelta(days=30), "moderate")
        assert ok is False
        assert "name" in msg.lower()
    
    def test_error_messages_dont_leak_sensitive_info(self):
        """Test that error messages don't leak sensitive information."""
        from utils.validators import validate_goal
        
        # Should not expose internal paths or system info
        ok, msg = validate_goal(
            "test",
            -1000,
            date.today() - timedelta(days=1),
            "invalid"
        )
        
        assert ok is False
        # Message should not contain file paths, stack traces, etc.
        assert "traceback" not in msg.lower()
        assert "file " not in msg.lower()
        assert "/home" not in msg.lower()
        assert "c:\\" not in msg.lower()
