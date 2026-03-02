# 📈 Goal-Based Stock Portfolio Advisory System

A goal-oriented investment advisory platform that helps users plan, monitor, and rebalance their stock portfolios to achieve real-life financial goals.

> ⚠️ **Disclaimer**: This is an educational project for a final year college course. It does not provide financial advice or guarantee investment returns.

## 🎯 Features

- **Goal Management** - Create financial goals with target amounts, deadlines, and risk preferences
- **Transaction Validation** - Validates stock prices against historical OHLC data
- **Portfolio Tracking** - Real-time portfolio value and P&L calculations
- **Asset Allocation** - Visual breakdown of portfolio holdings
- **Rebalancing Recommendations** - AI-powered buy/sell suggestions
- **Monte Carlo Simulation** - Probabilistic goal achievement analysis
- **Stress Testing** - Simulates market drop scenarios (10%, 20%, 35%)

## 🛠️ Tech Stack

### Backend
- **Python 3.10+**
- **FastAPI** - Modern async API framework
- **SQLAlchemy** - ORM for database operations
- **SQLite** - Lightweight database
- **yfinance** - Stock market data
- **Pandas/NumPy** - Data analysis

### Frontend
- **HTML5/CSS3/JavaScript** - No frameworks, vanilla JS
- **Chart.js** - Beautiful charts and visualizations
- **Inter Font** - Premium typography

## 📦 Installation

### Prerequisites
- Python 3.10 or higher
- pip (Python package manager)
- A modern web browser

### Backend Setup

1. **Navigate to backend directory:**
   ```bash
   cd backend
   ```

2. **Create virtual environment:**
   ```bash
   python -m venv venv
   ```

3. **Activate virtual environment:**
   - Windows:
     ```bash
     venv\Scripts\activate
     ```
   - macOS/Linux:
     ```bash
     source venv/bin/activate
     ```

4. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

5. **Run the server:**
   ```bash
   uvicorn main:app --reload
   ```
   
   The API will be available at `http://localhost:8000`

### Frontend Setup

1. **Open the frontend:**
   - Simply open `frontend/index.html` in your browser
   - Or use a local server:
     ```bash
     cd frontend
     python -m http.server 3000
     ```
     Then visit `http://localhost:3000`

## 🚀 Quick Start

1. **Start the backend server** (see installation above)

2. **Open the dashboard** (`frontend/index.html`)

3. **Create a new goal:**
   - Click "New Goal"
   - Enter goal name (e.g., "Car Purchase")
   - Set target amount and deadline
   - Choose risk preference

4. **Add transactions:**
   - Go to "Transactions" page
   - Select your goal
   - Enter stock symbol, quantity, price, and date
   - The system validates prices against historical data

5. **Monitor your portfolio:**
   - View real-time portfolio value
   - Check asset allocation
   - See recommendations

6. **Run simulations:**
   - Go to "Simulation" page
   - Run Monte Carlo analysis
   - See success probability and risk level

## 📡 API Endpoints

### Goals
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/goals` | Create a new goal |
| GET | `/api/goals` | List all goals |
| GET | `/api/goals/{id}` | Get goal details |
| PUT | `/api/goals/{id}` | Update goal |
| DELETE | `/api/goals/{id}` | Delete goal |

### Transactions
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/transactions` | Record transaction |
| GET | `/api/transactions` | List transactions |

### Portfolio
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/portfolio/{goal_id}` | Get portfolio |
| GET | `/api/portfolio/{goal_id}/holdings` | Get holdings |
| GET | `/api/portfolio/{goal_id}/allocation` | Get allocation |

### Simulation
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/simulation/{goal_id}/monte-carlo` | Run simulation |
| POST | `/api/simulation/{goal_id}/stress-test` | Run stress test |

📖 **Full API Documentation:** Visit `http://localhost:8000/docs` when the server is running.

## 📁 Project Structure

```
Stocks/
├── backend/
│   ├── main.py                 # FastAPI application
│   ├── config.py               # Configuration
│   ├── requirements.txt        # Python dependencies
│   ├── database/
│   │   ├── db.py               # Database connection
│   │   └── models.py           # SQLAlchemy models
│   ├── routers/
│   │   ├── goals.py            # Goal APIs
│   │   ├── transactions.py     # Transaction APIs
│   │   ├── portfolio.py        # Portfolio APIs
│   │   ├── stocks.py           # Stock data APIs
│   │   ├── recommendations.py  # Recommendation APIs
│   │   └── simulation.py       # Simulation APIs
│   ├── services/
│   │   ├── market_data.py      # Stock price fetching
│   │   ├── portfolio_service.py# Portfolio calculations
│   │   ├── rebalancing.py      # Rebalancing engine
│   │   ├── monte_carlo.py      # Monte Carlo simulation
│   │   └── stress_testing.py   # Stress test scenarios
│   └── utils/
│       └── validators.py       # Input validation
├── frontend/
│   ├── index.html              # Dashboard
│   ├── goals.html              # Goals management
│   ├── transactions.html       # Transaction entry
│   ├── simulation.html         # Simulation page
│   ├── css/
│   │   └── styles.css          # Main stylesheet
│   └── js/
│       ├── api.js              # API client
│       ├── charts.js           # Chart configurations
│       ├── dashboard.js        # Dashboard logic
│       ├── goals.js            # Goals page logic
│       ├── transactions.js     # Transactions logic
│       └── simulation.js       # Simulation logic
└── data/
    └── stocks.db               # SQLite database (auto-created)
```

## 🧮 Key Algorithms

### Transaction Price Validation
Validates that user-entered prices fall within the actual trading range (Low-High) of that date, with a 2% tolerance for slight variations.

### Monte Carlo Simulation
Uses geometric Brownian motion to simulate 1000+ future portfolio paths based on historical returns and volatility, estimating the probability of achieving the target goal.

### Rebalancing Engine
Analyzes portfolio for:
- Concentration risk (>30% in single stock)
- Diversification issues (<3 stocks)
- Goal progress vs timeline
- Generates actionable buy/hold/sell recommendations

## 🎓 Academic Relevance

This project demonstrates:
- Application of finance concepts (portfolio theory, risk management)
- Data validation techniques (historical price verification)
- Risk modeling using probabilistic simulations
- Decision support system design
- RESTful API development
- Modern frontend development

## 📝 License

This project is for educational purposes only.

---

**Built with ❤️ for learning**
