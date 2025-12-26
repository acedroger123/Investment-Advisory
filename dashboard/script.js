// ======================================================
// DUMMY DASHBOARD DATA (Frontend Testing)
// ======================================================
const dummyDashboardData = {
  user: {
    name: "Amit Verma",
    riskProfile: "Moderate",
    portfolioValue: 112450
  },

  chart: {
    labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
    portfolio: [100000, 103200, 105800, 108400, 110900, 112450],
    benchmark: [100000, 101500, 103000, 104800, 106200, 107500]
  },

  holdings: [
    {
      name: "Apple Inc.",
      ticker: "AAPL",
      value: 18500,
      percent: 16.5,
      return: 18.2
    },
    {
      name: "Microsoft Corp.",
      ticker: "MSFT",
      value: 16200,
      percent: 14.4,
      return: 15.8
    },
    {
      name: "Vanguard Total Bond",
      ticker: "BND",
      value: 15000,
      percent: 13.4,
      return: 4.2
    },
    {
      name: "NVIDIA Corp.",
      ticker: "NVDA",
      value: 12800,
      percent: 11.4,
      return: 32.5
    },
    {
      name: "JPMorgan Chase",
      ticker: "JPM",
      value: 10500,
      percent: 9.4,
      return: 12.1
    }
  ]
};

// ======================================================
// GLOBAL CHART VARIABLE
// ======================================================
let performanceChart = null;

// ======================================================
// LOAD DUMMY DASHBOARD (NO BACKEND)
// ======================================================
function loadDashboard() {
  updateSummaryCards(dummyDashboardData.user);
  updateChart(dummyDashboardData.chart);
  renderHoldings(dummyDashboardData.holdings);
}

// ======================================================
// UPDATE SUMMARY CARDS
// ======================================================
function updateSummaryCards(user) {
  // Total Value
  document.getElementById("totalValue").textContent =
    "₹" + user.portfolioValue.toLocaleString();

  document.getElementById("totalreturn").textContent = "+12.4% this year";

  // YTD Return
  document.getElementById("ytdReturn").textContent = "+10.8%";
  document.getElementById("benchmarkCompare").textContent =
    "+2.3% vs S&P 500";

  // Risk
  document.getElementById("riskProfile").textContent = user.riskProfile;
  document.getElementById("sharpeRatio").textContent = "Sharpe: 1.42";

  // Portfolio Health
  document.getElementById("portfolioHealth").textContent = "Strong";
  document.getElementById("healthScore").textContent = "Score: 82 / 100";
}


// ======================================================
// UPDATE CHART.JS GRAPH
// ======================================================
function updateChart(chartData) {
  const ctx = document.getElementById("performanceChart").getContext("2d");

  if (performanceChart) performanceChart.destroy();

  performanceChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: chartData.labels,
      datasets: [
        {
          label: "Your Portfolio",
          data: chartData.portfolio,
          borderWidth: 2,
          tension: 0.4
        },
        {
          label: "Benchmark",
          data: chartData.benchmark,
          borderDash: [6, 6],
          borderWidth: 2,
          tension: 0.4
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: "bottom" }
      }
    }
  });
}

// ======================================================
// RENDER TOP HOLDINGS
// ======================================================
function renderHoldings(holdings) {
  const container = document.getElementById("holdingsList");
  container.innerHTML = "";

  holdings.forEach(stock => {
    const row = document.createElement("div");
    row.className = "holding-row";

    row.innerHTML = `
      <div>
        <strong>${stock.name}</strong>
        <div class="ticker">${stock.ticker}</div>
        <div class="muted">
          ₹${stock.value.toLocaleString()} • ${stock.percent}%
        </div>
      </div>
      <div class="return">+${stock.return}%</div>
    `;

    container.appendChild(row);
  });
}

// ======================================================
// INIT ON PAGE LOAD
// ======================================================
document.addEventListener("DOMContentLoaded", loadDashboard);
