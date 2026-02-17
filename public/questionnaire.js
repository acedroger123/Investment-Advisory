document.addEventListener("DOMContentLoaded", async () => {
  const stockContainer = document.getElementById("aiStockPicks");
  const behavioralContainer = document.getElementById("behavioralAdvice");
  const riskBadge = document.getElementById("userRiskBadge");

  /* ---------- 1. FETCH USER PROFILE & RISK ---------- */
  async function loadUserContext() {
    try {
      const res = await fetch("/auth/check", { credentials: "include" });
      const user = await res.json();

      if (!user.logged_in) {
        window.location.href = "SignIn.html";
        return;
      }

      // Display the risk level calculated in your questionnaire
      const riskLevels = ["Low", "Conservative", "Moderate", "Aggressive"];
      if (riskBadge) {
        const label = riskLevels[user.risk_label] || "Moderate";
        riskBadge.textContent = label;
        riskBadge.className = `badge risk-${label.toLowerCase()}`;
      }

      // 2. Fetch AI Recommendations based on this context
      fetchAIAdvice(user);
    } catch (err) {
      console.error("Context load failed:", err);
    }
  }

  /* ---------- 2. CALL PYTHON AI MODELS ---------- */
  async function fetchAIAdvice(user) {
    try {
      // Map survey values to what the Python K-Means model expects
      const payload = {
        current_amount: 10000,
        goal_amount: 50000,
        years: user.time_horizon || 3,
        risk_tolerance: user.risk_label >= 3 ? "high" : user.risk_label === 2 ? "medium" : "low"
      };

      // Call the Recommendation API (Port 8001) via Node Bridge
      const response = await fetch("/api/get-stock-recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      renderStocks(data.recommend);
      renderBehavioral(user, data.logic_summary);

    } catch (err) {
      console.warn("AI Recommendation service offline. Run run_all.py");
    }
  }

  /* ---------- 3. RENDER UI COMPONENTS ---------- */
  function renderStocks(stocks) {
    if (!stockContainer) return;
    stockContainer.innerHTML = "";

    stocks.slice(0, 4).forEach(stock => {
      const div = document.createElement("div");
      div.className = "card stock-card animate-fade-up";
      div.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <h4 style="margin:0; font-size:1.1rem;">${stock.ticker}</h4>
            <span style="font-size:0.75rem; color:var(--text-muted)">${stock.risks} Risk</span>
          </div>
          <div style="text-align:right;">
            <div style="color:var(--color-accent-green); font-weight:700;">↗ ${(stock.annual_return * 100).toFixed(1)}%</div>
            <div style="font-size:0.7rem; opacity:0.6;">Est. Yield</div>
          </div>
        </div>
      `;
      stockContainer.appendChild(div);
    });
  }

  function renderBehavioral(user, logicSummary) {
    if (!behavioralContainer) return;
    behavioralContainer.innerHTML = "";

    // Generate tips based on the Survey inputs
    const tips = [
      {
        icon: "shield-check",
        title: "Risk Alignment",
        text: `Based on your ${user.financial_comfort}/5 comfort score, this portfolio focuses on ${user.risk_label >= 2 ? 'growth' : 'capital protection'}.`
      },
      {
        icon: "calendar",
        title: "Timeline Strategy",
        text: `For your ${user.time_horizon}-year horizon, we've prioritized assets with high liquidity.`
      }
    ];

    tips.forEach(tip => {
      const div = document.createElement("div");
      div.className = "advice-item";
      div.innerHTML = `
        <div class="icon-box"><i data-lucide="${tip.icon}"></i></div>
        <div>
          <h5 style="margin:0 0 4px 0;">${tip.title}</h5>
          <p style="margin:0; font-size:0.85rem; color:var(--text-muted);">${tip.text}</p>
        </div>
      `;
      behavioralContainer.appendChild(div);
    });

    if (window.lucide) lucide.createIcons();
  }

  // --- INITIALIZE ---
  loadUserContext();
});