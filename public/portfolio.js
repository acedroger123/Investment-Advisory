document.querySelectorAll(".nav-item").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"))
    btn.classList.add("active")
  })
})

const uiData = {
  subtitle: "Track and manage your stock holdings",
  insight:
    "Your portfolio allocation matches well with your long-term financial goals. Consider rebalancing every 6 months.",

  questionnaire: {
    goalAmount: 100000,
    timeHorizon: 5,
    ownedStocks: "AAPL, GOOGL, TSLA",
    riskToleranceOptions: [
      { value: "low", label: "Low – Conservative investor" },
      { value: "medium", label: "Medium – Balanced approach" },
      { value: "high", label: "High – Aggressive growth" }
    ],
    selectedRisk: "medium"
  },

  requiredReturn: {
    value: "58.49%",
    subtext: "To reach $100,000 in 5 years"
  }
};

let portfolio = [
  { symbol: "AAPL", qty: 10, buy: 150, current: 159.11, risk: "low" },
  { symbol: "GOOGL", qty: 15, buy: 200, current: 187.81, risk: "medium" },
  { symbol: "TSLA", qty: 20, buy: 200, current: 197.09, risk: "low" }
];

const recommendedStocks = [
  { symbol: "MSFT", name: "Microsoft", sector: "Technology", risk: "MEDIUM", return: "13.2%" },
  { symbol: "V", name: "Visa Inc.", sector: "Finance", risk: "MEDIUM", return: "12.0%" },
  { symbol: "JPM", name: "JPMorgan Chase", sector: "Finance", risk: "MEDIUM", return: "11.8%" },
  { symbol: "BA", name: "Boeing", sector: "Aerospace", risk: "MEDIUM", return: "11.2%" },
  { symbol: "INTC", name: "Intel", sector: "Technology", risk: "MEDIUM", return: "10.8%" },
  { symbol: "DIS", name: "Disney", sector: "Entertainment", risk: "MEDIUM", return: "10.5%" },
  { symbol: "JNJ", name: "Johnson & Johnson", sector: "Healthcare", risk: "LOW", return: "8.5%" },
  { symbol: "VZ", name: "Verizon", sector: "Telecom", risk: "LOW", return: "7.5%" }
];


const table = document.getElementById("portfolioTable");

const totalValueEl = document.getElementById("totalValue");
const totalGainEl = document.getElementById("totalGain");
const totalReturnEl = document.getElementById("totalReturn");
const volatilityText = document.getElementById("volatilityText");

const subtitleEl = document.getElementById("pageSubtitle");
const insightEl = document.getElementById("goalInsight");

const goalAmountEl = document.getElementById("goalAmount");
const timeHorizonEl = document.getElementById("timeHorizon");
const ownedStocksEl = document.getElementById("ownedStocks");
const riskSelectEl = document.getElementById("riskTolerance");

const requiredReturnEl = document.getElementById("requiredReturn");
const returnSubtextEl = document.getElementById("returnSubtext");

const stocksListEl = document.getElementById("stocksList");
const stockCountEl = document.getElementById("stockCount");

const modal = document.getElementById("addStockModal");
const addBtn = document.querySelector(".add-btn");
const closeModal = document.getElementById("closeModal");
const saveStock = document.getElementById("saveStock");

function initUI() {
  subtitleEl.textContent = uiData.subtitle;
  insightEl.textContent = uiData.insight;

  goalAmountEl.value = uiData.questionnaire.goalAmount;
  timeHorizonEl.value = uiData.questionnaire.timeHorizon;
  ownedStocksEl.value = uiData.questionnaire.ownedStocks;

  uiData.questionnaire.riskToleranceOptions.forEach(opt => {
    const option = document.createElement("option");
    option.value = opt.value;
    option.textContent = opt.label;
    if (opt.value === uiData.questionnaire.selectedRisk) option.selected = true;
    riskSelectEl.appendChild(option);
  });

  requiredReturnEl.textContent = uiData.requiredReturn.value;
  returnSubtextEl.textContent = uiData.requiredReturn.subtext;
}

function calculateVolatility() {
  let riskScore = portfolio.reduce((acc, stock) => {
    if (stock.risk === "high") return acc + 2;
    if (stock.risk === "medium") return acc + 1;
    return acc;
  }, 0);

  let level = "low";
  if (riskScore >= portfolio.length * 1.5) level = "high";
  else if (riskScore >= portfolio.length * 0.7) level = "medium";

  volatilityText.textContent = level.charAt(0).toUpperCase() + level.slice(1);
  volatilityText.className = `volatility-${level}`;
}

function renderPortfolio() {
  table.innerHTML = "";
  let totalValue = 0;
  let invested = 0;

  portfolio.forEach(stock => {
    const value = stock.qty * stock.current;
    const investedValue = stock.qty * stock.buy;
    const gain = value - investedValue;
    const percent = (gain / investedValue) * 100;

    totalValue += value;
    invested += investedValue;

    const row = document.createElement("div");
    row.className = "table-row";
    row.innerHTML = `
      <span><b>${stock.symbol}</b></span>
      <span>${stock.qty}</span>
      <span>$${stock.buy.toFixed(2)}</span>
      <span>$${stock.current.toFixed(2)}</span>
      <span><b>$${value.toFixed(2)}</b></span>
      <span class="${gain >= 0 ? "positive" : "negative"}">
        ${gain >= 0 ? "+" : ""}$${gain.toFixed(2)} (${percent.toFixed(2)}%)
      </span>
      <span class="risk ${stock.risk}">${stock.risk}</span>
    `;
    table.appendChild(row);
  });

  const totalGain = totalValue - invested;

  totalValueEl.textContent = `$${totalValue.toFixed(2)}`;
  totalGainEl.textContent = `${totalGain >= 0 ? "+" : ""}$${totalGain.toFixed(2)}`;
  totalGainEl.className = totalGain >= 0 ? "positive" : "negative";
  totalReturnEl.textContent = `${((totalGain / invested) * 100).toFixed(2)}%`;

  calculateVolatility();
}

addBtn.onclick = () => modal.classList.add("active");
closeModal.onclick = () => modal.classList.remove("active");

saveStock.onclick = () => {
  const symbol = document.getElementById("symbolInput").value.toUpperCase();
  const qty = Number(document.getElementById("qtyInput").value);
  const buy = Number(document.getElementById("priceInput").value);

  if (!symbol || !qty || !buy) {
    alert("Fill all fields");
    return;
  }

  portfolio.push({
    symbol,
    qty,
    buy,
    current: buy * (0.95 + Math.random() * 0.1),
    risk: buy > 250 ? "medium" : "low"
  });

  renderPortfolio();
  modal.classList.remove("active");
};

function renderRecommendations() {
  stocksListEl.innerHTML = "";
  stockCountEl.textContent = `${recommendedStocks.length} stocks`;

  recommendedStocks.forEach(stock => {
    const card = document.createElement("div");
    card.className = `stock-card ${stock.risk === "LOW" ? "low-risk" : ""}`;

    card.innerHTML = `
      <div class="stock-left">
        <h5>${stock.symbol}
          <span>${stock.risk} RISK</span>
        </h5>
        <p>${stock.name}<br>${stock.sector}</p>
      </div>
      <div class="stock-right">
        <strong>↗ ${stock.return}</strong>
        <small>Expected Return</small>
      </div>
    `;

    stocksListEl.appendChild(card);
  });
}


initUI();
renderPortfolio();
renderRecommendations();
