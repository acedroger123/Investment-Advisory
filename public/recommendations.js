document.addEventListener("DOMContentLoaded", () => {
  const recList = document.getElementById("recList");
  const winList = document.getElementById("quickWinsList");

  // --- 1. STATIC FALLBACK DATA (In case AI is offline or no goals) ---
  const staticRecommendations = [
    {
      category: "Savings",
      priority: "High",
      title: "Boost Your Emergency Fund",
      desc: "Your emergency fund is at 35% of target. Increase monthly contribution by ₹5,000 to reach your goal 3 months earlier.",
      impact: "+₹60,000/yr",
      action: "Auto-Transfer",
      icon: "piggy-bank"
    },
    {
      category: "Expenses",
      priority: "High",
      title: "Reduce Dining Out",
      desc: "Dining expenses are 40% above budget. Limiting to 2 visits per week could save significant money.",
      impact: "-₹5,000/mo",
      action: "Set Limit",
      icon: "utensils"
    }
  ];

  const quickWins = [
    { text: "Cancel unused subscriptions", save: "₹600/mo" },
    { text: "Generic brands for groceries", save: "₹1,500/mo" },
    { text: "Use cashback credit card", save: "₹500/mo" },
    { text: "Review phone plan", save: "₹300/mo" }
  ];

  // --- 2. DYNAMIC GOAL LOADING ---
  async function loadUserGoals() {
    if (!recList) return;

    // Show loading state with a spinner
    recList.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px;">
        <i data-lucide="loader-2" class="spin text-primary" style="width: 40px; height: 40px; margin: 0 auto 20px;"></i>
        <p style="color: var(--text-muted);">AI is analyzing your financial goals and spending habits...</p>
      </div>
    `;
    lucide.createIcons();

    try {
      const response = await fetch("/api/goals", { credentials: "include" });
      const goals = await response.json();

      if (goals && goals.length > 0) {
        // Automatically use the primary/most recent goal for analysis
        const primaryGoal = goals[0];
        fetchRealRecommendations(primaryGoal);
      } else {
        // Guide user to add a goal if none exist
        recList.innerHTML = `
          <div class="card" style="grid-column: 1/-1; text-align: center; padding: 40px; border: 1px dashed var(--border-color);">
            <i data-lucide="target" style="width: 48px; height: 48px; margin: 0 auto 16px; opacity: 0.5;"></i>
            <h3 style="margin-bottom: 8px;">No Goals Found</h3>
            <p style="color: var(--text-muted); margin-bottom: 20px;">Add a financial goal to receive personalized investment advice.</p>
            <a href="goals.html" class="btn btn-primary" style="display: inline-flex; align-items: center; gap: 8px;">
              <i data-lucide="plus" size="18"></i> Create First Goal
            </a>
          </div>
        `;
        lucide.createIcons();
      }
    } catch (err) {
      console.error("Error loading goals:", err);
      fetchRealRecommendations(null); // Fallback to static data
    }
  }

  // --- 3. FETCH REAL RECOMMENDATIONS FROM ML API ---
  async function fetchRealRecommendations(targetGoal = null) {
    try {
      // Construction of URL with goal parameters for the backend bridge
      const url = targetGoal
        ? `/api/ai-analysis?goal_amount=${targetGoal.target_amount}&months=${targetGoal.duration_months}`
        : "/api/ai-analysis";

      const res = await fetch(url, { credentials: "include" });

      if (!res.ok) throw new Error("AI Service Offline");

      const aiData = await res.json();

      // Priority mapping for AI-generated suggestions
      if (aiData.suggestions && aiData.suggestions.length > 0) {
        const dynamicRecs = aiData.suggestions.map(s => ({
          category: s.category || "AI Insight",
          title: s.title,
          desc: s.text,
          priority: s.level || "Medium",
          icon: s.icon_name || "sparkles",
          impact: s.monetary_gain || "Growth",
          action: s.action_label || "View Details"
        }));
        renderRecs(dynamicRecs);
      } else {
        renderRecs(staticRecommendations);
      }
    } catch (err) {
      console.warn("AI Service unreachable, displaying static insights.");
      renderRecs(staticRecommendations);
    }
  }

  // --- 4. RENDER LOGIC ---
  function renderRecs(dataArray) {
    if (!recList) return;
    recList.innerHTML = "";

    dataArray.forEach(rec => {
      // Determine Badge Style based on priority level
      let badgeStyle = "background: rgba(99, 102, 241, 0.15); color: var(--color-primary-light);";
      if (rec.priority === "High") badgeStyle = "background: rgba(239, 68, 68, 0.15); color: var(--color-accent-red);";
      if (rec.priority === "Medium") badgeStyle = "background: rgba(245, 158, 11, 0.15); color: var(--color-accent-orange);";
      if (rec.priority === "Low") badgeStyle = "background: rgba(16, 185, 129, 0.15); color: var(--color-accent-green);";

      const card = document.createElement("div");
      card.className = "rec-card animate-fade-up";

      card.innerHTML = `
        <div class="rec-icon-box">
          <i data-lucide="${rec.icon}" size="24"></i>
        </div>
        
        <div style="flex: 1;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px;">
            <div>
              <span style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); font-weight: 600; letter-spacing: 0.5px;">${rec.category}</span>
              <h3 style="font-size: 1.1rem; font-weight: 600; color: var(--text-primary); margin-top: 2px;">${rec.title}</h3>
            </div>
            <span style="font-size: 0.7rem; padding: 4px 10px; border-radius: 99px; font-weight: 600; text-transform: uppercase; ${badgeStyle}">${rec.priority}</span>
          </div>
          
          <p style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 16px; line-height: 1.5;">${rec.desc}</p>
          
          <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-color); padding-top: 12px;">
            <div style="display: flex; align-items: center; gap: 6px; font-size: 0.85rem; font-weight: 600; color: var(--color-accent-green);">
              <i data-lucide="trending-up" size="16"></i> ${rec.impact}
            </div>
            <button class="btn btn-primary" style="width: auto; padding: 6px 12px; font-size: 0.8rem;">${rec.action || 'View'}</button>
          </div>
        </div>
      `;
      recList.appendChild(card);
    });

    if (window.lucide) lucide.createIcons();
  }

  function renderWins() {
    if (!winList) return;
    winList.innerHTML = "";
    quickWins.forEach(win => {
      const div = document.createElement("div");
      div.className = "win-item";
      div.innerHTML = `
        <span style="color: var(--text-primary);">${win.text}</span>
        <span class="win-save">${win.save}</span>
      `;
      winList.appendChild(div);
    });
  }

  // --- INITIALIZE ---
  renderWins();
  loadUserGoals();
});