"""
Market Data Service - Fetches and caches stock price data.
Uses yfinance for historical and near real-time data.
"""
import yfinance as yf
import pandas as pd
from datetime import datetime, date, timedelta
from typing import Optional, Dict, List, Tuple
from sqlalchemy.orm import Session
import time
import logging

from database.models import StockPrice

logger = logging.getLogger(__name__)

# ==========================================
# IN-MEMORY PRICE CACHE
# ==========================================
_current_price_cache: Dict[str, tuple] = {}   # {symbol: (price, timestamp)}
_history_cache: Dict[tuple, tuple] = {}        # {(symbol, start, end): (dataframe, timestamp)}
PRICE_CACHE_TTL = 300    # 5 minutes in seconds
HISTORY_CACHE_TTL = 600  # 10 minutes in seconds


def _get_cached_current_price(symbol: str) -> Optional[float]:
    """Return cached price if still valid, else None."""
    if symbol in _current_price_cache:
        price, ts = _current_price_cache[symbol]
        if time.time() - ts < PRICE_CACHE_TTL:
            return price
    return None


def _set_cached_current_price(symbol: str, price: float):
    """Store a price in the cache."""
    _current_price_cache[symbol] = (price, time.time())


def _get_cached_history(symbol: str, start: date, end: date) -> Optional[pd.DataFrame]:
    """Return cached history DataFrame if still valid, else None."""
    key = (symbol, start.isoformat(), end.isoformat())
    if key in _history_cache:
        df, ts = _history_cache[key]
        if time.time() - ts < HISTORY_CACHE_TTL:
            return df
    return None


def _set_cached_history(symbol: str, start: date, end: date, df: pd.DataFrame):
    """Store a history DataFrame in the cache."""
    key = (symbol, start.isoformat(), end.isoformat())
    _history_cache[key] = (df, time.time())


class MarketDataService:
    """Service for fetching and managing stock market data."""
    
    # Indian stock suffix for NSE
    NSE_SUFFIX = ".NS"
    BSE_SUFFIX = ".BO"
    
    @staticmethod
    def normalize_symbol(symbol: str, exchange: str = "NSE") -> str:
        """
        Normalize stock symbol for yfinance.
        Adds exchange suffix if not present.
        """
        symbol = symbol.upper().strip()
        
        # If already has suffix, return as is
        if symbol.endswith(".NS") or symbol.endswith(".BO"):
            return symbol
        
        # For US stocks, no suffix needed
        if exchange.upper() == "US":
            return symbol
            
        # Add appropriate suffix for Indian stocks
        if exchange.upper() == "BSE":
            return f"{symbol}{MarketDataService.BSE_SUFFIX}"
        return f"{symbol}{MarketDataService.NSE_SUFFIX}"
    
    @staticmethod
    def get_stock_info(symbol: str) -> Optional[Dict]:
        """
        Get basic stock information.
        Returns None if stock not found.
        """
        try:
            # Check if we already have a cached price to avoid the info call
            ticker = yf.Ticker(symbol)
            info = ticker.info
            
            if not info or info.get('regularMarketPrice') is None:
                return None
            
            # Cache the price we got from info
            price = info.get("regularMarketPrice", 0)
            if price:
                _set_cached_current_price(symbol, float(price))
                
            return {
                "symbol": symbol,
                "name": info.get("longName") or info.get("shortName", symbol),
                "current_price": price,
                "previous_close": info.get("previousClose", 0),
                "day_high": info.get("dayHigh", 0),
                "day_low": info.get("dayLow", 0),
                "volume": info.get("volume", 0),
                "market_cap": info.get("marketCap", 0),
                "sector": info.get("sector", "Unknown"),
                "industry": info.get("industry", "Unknown"),
                "currency": info.get("currency", "INR"),
                "exchange": info.get("exchange", "NSE")
            }
        except Exception as e:
            print(f"Error fetching stock info for {symbol}: {e}")
            return None
    
    @staticmethod
    def get_current_price(symbol: str) -> Optional[float]:
        """Get the current/latest price for a stock. Uses in-memory cache."""
        # Check cache first
        cached = _get_cached_current_price(symbol)
        if cached is not None:
            return cached
        
        try:
            ticker = yf.Ticker(symbol)
            # Use fast_info which is much faster than .info
            try:
                price = ticker.fast_info.get('lastPrice') or ticker.fast_info.get('regularMarketPrice')
                if price:
                    price = float(price)
                    _set_cached_current_price(symbol, price)
                    return price
            except Exception:
                pass
            
            # Fallback to history (faster than .info)
            hist = ticker.history(period="1d")
            if not hist.empty:
                price = float(hist['Close'].iloc[-1])
                _set_cached_current_price(symbol, price)
                return price
            return None
        except Exception as e:
            print(f"Error fetching current price for {symbol}: {e}")
            return None
    
    @staticmethod
    def get_multiple_current_prices(symbols: List[str]) -> Dict[str, float]:
        """
        Get current prices for multiple stocks efficiently.
        Uses yf.download() for a single batch request, then caches all results.
        Falls back to individual calls if batch fails.
        """
        if not symbols:
            return {}
        
        prices = {}
        uncached_symbols = []
        
        # Check cache first for all symbols
        for symbol in symbols:
            cached = _get_cached_current_price(symbol)
            if cached is not None:
                prices[symbol] = cached
            else:
                uncached_symbols.append(symbol)
        
        if not uncached_symbols:
            return prices
        
        # Batch fetch uncached symbols
        try:
            data = yf.download(uncached_symbols, period="1d", progress=False, threads=True)
            if not data.empty:
                if hasattr(data.columns, 'nlevels') and data.columns.nlevels > 1:
                    # yfinance 1.1+ returns MultiIndex columns: (Price, Ticker)
                    for symbol in uncached_symbols:
                        try:
                            price = float(data[('Close', symbol)].iloc[-1])
                            if not pd.isna(price):
                                prices[symbol] = price
                                _set_cached_current_price(symbol, price)
                        except (KeyError, IndexError):
                            pass
                elif len(uncached_symbols) == 1:
                    # Single symbol - flat columns
                    if 'Close' in data.columns and not data['Close'].empty:
                        price = float(data['Close'].iloc[-1])
                        if not pd.isna(price):
                            prices[uncached_symbols[0]] = price
                            _set_cached_current_price(uncached_symbols[0], price)
                else:
                    # Older yfinance: multi-level with ['Close'][symbol] access
                    for symbol in uncached_symbols:
                        try:
                            close_col = data['Close'][symbol]
                            if close_col is not None and not close_col.empty:
                                price = float(close_col.iloc[-1])
                                if not pd.isna(price):
                                    prices[symbol] = price
                                    _set_cached_current_price(symbol, price)
                        except (KeyError, IndexError):
                            pass
        except Exception as e:
            logger.warning(f"Batch price fetch failed, falling back to individual: {e}")
        
        # Fallback for any symbols still missing
        for symbol in uncached_symbols:
            if symbol not in prices:
                price = MarketDataService.get_current_price(symbol)
                if price:
                    prices[symbol] = price
        
        return prices
    
    @staticmethod
    def get_multiple_prices(symbols: List[str]) -> Dict[str, float]:
        """Get current prices for multiple stocks. Alias for get_multiple_current_prices."""
        return MarketDataService.get_multiple_current_prices(symbols)
    
    @staticmethod
    def get_historical_data(
        symbol: str,
        start_date: date,
        end_date: date = None
    ) -> pd.DataFrame:
        """
        Fetch historical OHLC data for a stock.
        Returns a DataFrame with Date, Open, High, Low, Close, Volume.
        Uses in-memory cache to avoid redundant yfinance calls.
        """
        try:
            if end_date is None:
                end_date = date.today()
            
            # Check cache first
            cached = _get_cached_history(symbol, start_date, end_date)
            if cached is not None:
                return cached
            
            ticker = yf.Ticker(symbol)
            hist = ticker.history(
                start=start_date.strftime("%Y-%m-%d"),
                end=(end_date + timedelta(days=1)).strftime("%Y-%m-%d")
            )
            
            if hist.empty:
                return pd.DataFrame()
            
            # Reset index to make Date a column
            hist = hist.reset_index()
            hist['Date'] = pd.to_datetime(hist['Date']).dt.date
            
            result = hist[['Date', 'Open', 'High', 'Low', 'Close', 'Volume']]
            
            # Cache the result
            _set_cached_history(symbol, start_date, end_date, result)
            
            return result
        except Exception as e:
            print(f"Error fetching historical data for {symbol}: {e}")
            return pd.DataFrame()
    
    @staticmethod
    def get_price_on_date(symbol: str, target_date: date) -> Optional[Dict]:
        """
        Get OHLC data for a specific date.
        Returns dict with open, high, low, close, volume.
        """
        try:
            # Fetch a small range around the date to handle weekends/holidays
            start = target_date - timedelta(days=5)
            end = target_date + timedelta(days=1)
            
            hist = MarketDataService.get_historical_data(symbol, start, end)
            
            if hist.empty:
                return None
            
            # Try to find exact date
            exact_match = hist[hist['Date'] == target_date]
            if not exact_match.empty:
                row = exact_match.iloc[0]
                return {
                    "date": target_date,
                    "open": float(row['Open']),
                    "high": float(row['High']),
                    "low": float(row['Low']),
                    "close": float(row['Close']),
                    "volume": int(row['Volume'])
                }
            
            # If exact date not found (weekend/holiday), return closest previous trading day
            hist = hist[hist['Date'] <= target_date]
            if not hist.empty:
                row = hist.iloc[-1]
                return {
                    "date": row['Date'],
                    "open": float(row['Open']),
                    "high": float(row['High']),
                    "low": float(row['Low']),
                    "close": float(row['Close']),
                    "volume": int(row['Volume']),
                    "note": "Closest trading day before requested date"
                }
            
            return None
        except Exception as e:
            print(f"Error fetching price on date for {symbol}: {e}")
            return None
    
    @staticmethod
    def validate_transaction_price(
        symbol: str,
        transaction_date: date,
        entered_price: float,
        tolerance: float = 0.02  # 2% tolerance for slight variations
    ) -> Tuple[bool, str]:
        """
        Validate that a transaction price falls within the day's trading range.
        
        Returns:
            (is_valid, message)
        """
        price_data = MarketDataService.get_price_on_date(symbol, transaction_date)
        
        if not price_data:
            return False, f"Could not fetch price data for {symbol} on {transaction_date}"
        
        low = price_data['low']
        high = price_data['high']
        
        # Apply tolerance
        adjusted_low = low * (1 - tolerance)
        adjusted_high = high * (1 + tolerance)
        
        if adjusted_low <= entered_price <= adjusted_high:
            return True, f"Price validated. Day range: ₹{low:.2f} - ₹{high:.2f}"
        else:
            return False, f"Price ₹{entered_price:.2f} is outside day's range (₹{low:.2f} - ₹{high:.2f})"
    
    @staticmethod
    def get_historical_returns(symbol: str, years: int = 1) -> pd.Series:
        """
        Calculate daily returns for a stock over the specified period.
        Used for Monte Carlo simulation.
        """
        end_date = date.today()
        start_date = end_date - timedelta(days=years * 365)
        
        hist = MarketDataService.get_historical_data(symbol, start_date, end_date)
        
        if hist.empty or len(hist) < 2:
            return pd.Series()
        
        # Calculate daily percentage returns
        returns = hist['Close'].pct_change().dropna()
        return returns
    
    @staticmethod
    def cache_prices_to_db(db: Session, symbol: str, start_date: date, end_date: date = None):
        """
        Fetch and cache historical prices to the database.
        """
        hist = MarketDataService.get_historical_data(symbol, start_date, end_date)
        
        if hist.empty:
            return 0
        
        count = 0
        for _, row in hist.iterrows():
            # Check if already exists
            existing = db.query(StockPrice).filter(
                StockPrice.symbol == symbol,
                StockPrice.date == row['Date']
            ).first()
            
            if not existing:
                price = StockPrice(
                    symbol=symbol,
                    date=row['Date'],
                    open=row['Open'],
                    high=row['High'],
                    low=row['Low'],
                    close=row['Close'],
                    volume=row['Volume']
                )
                db.add(price)
                count += 1
        
        db.commit()
        return count
    
    @staticmethod
    def get_cached_price(db: Session, symbol: str, target_date: date) -> Optional[StockPrice]:
        """Get price from database cache."""
        return db.query(StockPrice).filter(
            StockPrice.symbol == symbol,
            StockPrice.date == target_date
        ).first()
    
    @staticmethod
    def search_stocks(query: str, limit: int = 10) -> List[Dict]:
        """
        Search for stocks by name or symbol.
        Note: yfinance doesn't have a built-in search, so this uses a basic approach.
        """
        # Common Indian stock symbols for demo purposes
        common_stocks = [
            {"symbol": "RELIANCE.NS", "name": "Reliance Industries Limited"},
            {"symbol": "TCS.NS", "name": "Tata Consultancy Services"},
            {"symbol": "HDFCBANK.NS", "name": "HDFC Bank Limited"},
            {"symbol": "INFY.NS", "name": "Infosys Limited"},
            {"symbol": "ICICIBANK.NS", "name": "ICICI Bank Limited"},
            {"symbol": "HINDUNILVR.NS", "name": "Hindustan Unilever Limited"},
            {"symbol": "ITC.NS", "name": "ITC Limited"},
            {"symbol": "SBIN.NS", "name": "State Bank of India"},
            {"symbol": "BHARTIARTL.NS", "name": "Bharti Airtel Limited"},
            {"symbol": "KOTAKBANK.NS", "name": "Kotak Mahindra Bank"},
            {"symbol": "WIPRO.NS", "name": "Wipro Limited"},
            {"symbol": "ASIANPAINT.NS", "name": "Asian Paints Limited"},
            {"symbol": "MARUTI.NS", "name": "Maruti Suzuki India Limited"},
            {"symbol": "TATAMOTORS.NS", "name": "Tata Motors Limited"},
            {"symbol": "TATASTEEL.NS", "name": "Tata Steel Limited"},
            {"symbol": "AXISBANK.NS", "name": "Axis Bank Limited"},
            {"symbol": "SUNPHARMA.NS", "name": "Sun Pharmaceutical Industries"},
            {"symbol": "BAJFINANCE.NS", "name": "Bajaj Finance Limited"},
            {"symbol": "HCLTECH.NS", "name": "HCL Technologies Limited"},
            {"symbol": "TECHM.NS", "name": "Tech Mahindra Limited"},
        ]
        
        query = query.lower()
        results = []
        
        for stock in common_stocks:
            if query in stock['symbol'].lower() or query in stock['name'].lower():
                results.append(stock)
                if len(results) >= limit:
                    break
        
        return results
