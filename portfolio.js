const portfolio = {
  totalvalue: 100000,
  risk: "Moderate",

  assets: [
    { name: "Stocks", value: 70000 },
    { name: "Bonds", value: 20000 },
    { name: "Real Estate", value: 7000 },
    { name: "Commodities", value: 3000 }
  ],

  investments: [
    { name: "S&P 500 Index Fund", amount: 45000 },
    { name: "Tech Growth ETF", amount: 25000 },
    { name: "Government Bonds", amount: 12000 },
    { name: "Corporate Bonds", amount: 8000 }
  ]
};

document.getElementById("portvalue").innerText = portfolio.totalvalue;
document.getElementById("risklevel").innerText = portfolio.risk;

const assetlist = document.getElementById("assets");
portfolio.assets.forEach(asset => {
  const li = document.createElement("li");
  li.innerText = asset.name + asset.value;
  assetlist.appendChild(li);
})

const investmentlist = document.getElementById("investments");
portfolio.investments.forEach(investing => {
  const li = document.createElement("li");
  li.innerText = investing.name + investing.amount;
  investmentlist.appendChild(li);
})

const ctx = document.getElementById("assetdisttributionchart");
new Chart(ctx, {
  type: "pie",
  data: {
    labels: portfolio.assets.map(a => a.name),
    datasets: [{
      data: portfolio.assets.map(a => a.value),
       backgroundColor: [
        "#4f7cff",
        "#1abc84",
        "#f5a623",
        "#8b5cf6"
      ]
    }]
  }
});

