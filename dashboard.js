let newchart = null;
document.addEventListener("DOMContentLoaded", () =>{
  document.getElementById("totalvalue").innerText = "112,450";
  document.getElementById("totalreturn").innerText = "+12.4% this year";
  document.getElementById("ytdreturn").innerText = "+10.8";
  document.getElementById("benchmarkCompare").innerText = "+2.3% vs S&P 500";
  document.getElementById("riskprofile").innerText = "Moderate";
  document.getElementById("totalvalue").innerText = "112,450";
  document.getElementById("portfoliohealth").innerText = "Strong";
  document.getElementById("healthscore").innerText = "score: 82/100";

  const charting = document.getElementById("performancechart").getContext("2d");
  newchart = new Chart(charting, {
    type:"line",
    data:{
      labels: ["last Month", "This Month", "Next Month"],
      datasets: [
        {
          label: "Income",
          data: [50000,50000,55000],
          borderWidth: 2
        },
        {
          label: "Expenditure",
          data: [35000, 40000, 43000],
          borderWidth: 2,
          borderDash: [5,5]
        }
      ]
    },
    Options: {
      responsive: true
    }
  });
    


   const holdings = document.getElementById("holdingslist");

  holdings.innerHTML = `
    <div class="holding-row">
      <div>
        <strong>Apple Inc.</strong>
        <div class="ticker">AAPL</div>
        <div>₹18,500 • 16.5%</div>
      </div>
      <div class="return">+18.2%</div>
    </div>

    <div class="holding-row">
      <div>
        <strong>Microsoft Corp.</strong>
        <div class="ticker">MSFT</div>
        <div>₹16,200 • 14.4%</div>
      </div>
      <div class="return">+15.8%</div>
    </div>

    <div class="holding-row">
      <div>
        <strong>NVIDIA Corp.</strong>
        <div class="ticker">NVDA</div>
        <div>₹12,800 • 11.4%</div>
      </div>
      <div class="return">+32.5%</div>
    </div>
  `;
});