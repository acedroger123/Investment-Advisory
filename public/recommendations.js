document.addEventListener("DOMContentLoaded", () => {
  const recList = document.getElementById("recList");
  const winList = document.getElementById("quickWinsList");
  const runAnalysisBtn = document.getElementById("runAnalysisBtn");
  const analysisStatus = document.getElementById("analysisStatus");
  const potentialSavings = document.getElementById("potentialSavings");
  const goalGapCovered = document.getElementById("goalGapCovered");
  const timelineReduction = document.getElementById("timelineReduction");
  const aiInsightText = document.getElementById("aiInsightText");
  const primaryFocusText = document.getElementById("primaryFocusText");
  const monthlyDirectionText = document.getElementById("monthlyDirectionText");
  const roadmapList = document.getElementById("roadmapList");
  const technicalWhy = document.getElementById("technicalWhy");
  const financialHealthScore = document.getElementById("financialHealthScore");
  const financialHealthTag = document.getElementById("financialHealthTag");
  const habitSummaryEl = document.getElementById("habitConflictSummary");
  const habitMetaEl = document.getElementById("habitConflictMeta");
  const habitRoadmapEl = document.getElementById("habitRoadmap");
  const goalFilterSelect = document.getElementById("goalFilterSelect");
  const goalChips = document.getElementById("goalChips");
  const selectedGoalsInfo = document.getElementById("selectedGoalsInfo");

  // Store all goals and current filter state
  let allGoals = [];
  let selectedGoalFilter = "top3"; // "top3", "all", or a specific goal ID
  let latestHabitData = null;

  const DEFAULT_QUICK_WINS = [
    { text: "Cancel unused subscriptions", save: "₹600/mo" },
    { text: "Switch to lower-cost grocery alternatives", save: "₹1,500/mo" },
    { text: "Use cashback for recurring spends", save: "₹500/mo" },
    { text: "Review mobile/internet plans", save: "₹300/mo" }
  ];

  const FALLBACK_SIMPLE_RECS = [
    {
      category: "Savings",
      priority: "High",
      title: "Boost Your Emergency Fund",
      desc: "Increase monthly contribution by ₹5,000 to improve goal safety and shorten timeline.",
      impact: "+₹60,000/yr",
      action: "Apply",
      icon: "piggy-bank"
    },
    {
      category: "Expenses",
      priority: "Medium",
      title: "Reduce Non-Essential Spending",
      desc: "Trim high-variance categories and enforce weekly caps.",
      impact: "-₹5,000/mo",
      action: "Apply",
      icon: "wallet"
    },
    {
      category: "Planning",
      priority: "Medium",
      title: "Automate Goal Contributions",
      desc: "Set a fixed monthly auto-transfer so savings remain consistent regardless of spend variance.",
      impact: "+Consistency",
      action: "Apply",
      icon: "calendar"
    }
  ];

  const FALLBACK_RANKED_RECOMMENDATIONS = [
    {
      rank: 1,
      recommendation: "Set a weekly budget cap and track adherence.",
      score: 0.87,
      score_tier: "Critical",
      why_ranked: "High discretionary volatility is delaying core goals.",
      impacts_goal: "Primary Goal",
      feasibility_impact_pct: -12.0,
      goal_success_probability_before: 64.0,
      goal_success_probability_after: 79.0,
      goal_timeline_reduction_months: 2.4,
      difficulty_level: "Easy",
      technical_why: "Dominant factor: goal pressure and spend volatility."
    },
    {
      rank: 2,
      recommendation: "Batch purchases into 1-2 planned sessions weekly.",
      score: 0.74,
      score_tier: "High",
      why_ranked: "Purchase frequency clustering is increasing monthly leakage.",
      impacts_goal: "Secondary Goal",
      feasibility_impact_pct: -9.0,
      goal_success_probability_before: 64.0,
      goal_success_probability_after: 75.0,
      goal_timeline_reduction_months: 1.9,
      difficulty_level: "Moderate",
      technical_why: "Dominant factor: frequency and consistency."
    },
    {
      rank: 3,
      recommendation: "Move impulse purchases to fixed daytime windows.",
      score: 0.61,
      score_tier: "Moderate",
      why_ranked: "Night spend spikes are reducing consistency.",
      impacts_goal: "Primary Goal",
      feasibility_impact_pct: -7.0,
      goal_success_probability_before: 64.0,
      goal_success_probability_after: 72.0,
      goal_timeline_reduction_months: 1.5,
      difficulty_level: "Behavioral Shift Required",
      technical_why: "Dominant factor: night ratio and impulse exposure."
    },
    {
      rank: 4,
      recommendation: "Automate savings transfers on salary credit day.",
      score: 0.58,
      score_tier: "Moderate",
      why_ranked: "Consistent automated transfers reduce goal timeline variance.",
      impacts_goal: "Secondary Goal",
      feasibility_impact_pct: -8.0,
      goal_success_probability_before: 64.0,
      goal_success_probability_after: 70.0,
      goal_timeline_reduction_months: 1.3,
      difficulty_level: "Easy",
      technical_why: "Dominant factor: savings automation reduces friction."
    },
    {
      rank: 5,
      recommendation: "Review and cancel underutilized subscriptions.",
      score: 0.52,
      score_tier: "Moderate",
      why_ranked: "Recurring subscription leakage affects multiple goal timelines.",
      impacts_goal: "All Goals",
      feasibility_impact_pct: -5.0,
      goal_success_probability_before: 64.0,
      goal_success_probability_after: 68.0,
      goal_timeline_reduction_months: 0.9,
      difficulty_level: "Easy",
      technical_why: "Dominant factor: recurring cost optimization."
    }
  ];

  const FALLBACK_GUIDANCE = {
    primary_financial_focus_area: {
      message: "Your current financial priority should be strengthening your Emergency Buffer.",
      global_priority_formula: "GoalPriority x ConflictSeverity x FeasibilityDrop"
    },
    monthly_strategic_direction:
      "This month's key focus: control discretionary spending and protect monthly savings consistency.",
    personalized_roadmap_suggestion: [
      "Step 1: Stabilize emergency reserves.",
      "Step 2: Optimize discretionary cash flow.",
      "Step 3: Increase long-term allocation efficiency."
    ],
    financial_alignment_score: {
      score_pct: 72.0,
      label: "Moderate Optimization Needed"
    },
    impact_summary: {
      potential_savings_monthly: 7800.0,
      goal_gap_covered_pct: 39.4,
      timeline_reduction_months: 3.1
    }
  };

  let latestGoal = null;

  /**
   * Load all goals from FastAPI and populate the filter dropdown
   */
  async function loadAllGoals() {
    try {
      const response = await fetch("/pa-api/goals", { credentials: "include" });
      if (!response.ok) throw new Error("Failed to load goals");
      const goals = await response.json();
      
      if (Array.isArray(goals) && goals.length > 0) {
        // Sort by ID ascending (oldest first)
        allGoals = goals.sort((a, b) => a.id - b.id);
        populateGoalFilter();
        renderGoalChips();
      }
    } catch (error) {
      console.warn("Could not load goals:", error.message);
      allGoals = [];
    }
  }

  /**
   * Populate the goal filter dropdown with individual goals
   */
  function populateGoalFilter() {
    if (!goalFilterSelect) return;
    
    // Keep the default options, add individual goals
    const existingOptions = goalFilterSelect.querySelectorAll("option");
    // Remove any previously added goal options (after the disabled separator)
    let foundSeparator = false;
    existingOptions.forEach(opt => {
      if (opt.disabled && opt.textContent.includes("Select Individual")) {
        foundSeparator = true;
      } else if (foundSeparator && !opt.disabled) {
        opt.remove();
      }
    });
    
    // Add individual goal options
    allGoals.forEach(goal => {
      const option = document.createElement("option");
      option.value = `goal_${goal.id}`;
      option.textContent = `${goal.name} (₹${Number(goal.target_amount || goal.target_value || 0).toLocaleString("en-IN")})`;
      goalFilterSelect.appendChild(option);
    });
  }

  /**
   * Render goal chips showing which goals are currently selected
   */
  function renderGoalChips() {
    if (!goalChips) return;
    goalChips.innerHTML = "";
    
    let goalsToShow = [];
    if (selectedGoalFilter === "top3") {
      goalsToShow = allGoals.slice(0, 3);
    } else if (selectedGoalFilter === "all") {
      goalsToShow = allGoals;
    } else if (selectedGoalFilter.startsWith("goal_")) {
      const goalId = parseInt(selectedGoalFilter.replace("goal_", ""), 10);
      const goal = allGoals.find(g => g.id === goalId);
      if (goal) goalsToShow = [goal];
    }
    
    if (goalsToShow.length === 0) {
      goalChips.innerHTML = '<span style="color: var(--text-muted); font-size: 0.85rem;">No goals selected</span>';
      if (selectedGoalsInfo) selectedGoalsInfo.textContent = "Showing: 0 goals";
      return;
    }
    
    goalsToShow.forEach(goal => {
      const chip = document.createElement("span");
      chip.className = "goal-chip";
      chip.innerHTML = `<i data-lucide="target" style="width: 14px; height: 14px;"></i> ${goal.name}`;
      goalChips.appendChild(chip);
    });
    
    if (selectedGoalsInfo) {
      selectedGoalsInfo.textContent = `Showing: ${goalsToShow.length} goal${goalsToShow.length !== 1 ? "s" : ""}`;
    }
    
    if (window.lucide) window.lucide.createIcons();
  }

  /**
   * Get goal names based on current filter
   */
  function getSelectedGoalNames() {
    if (selectedGoalFilter === "top3") {
      return allGoals.slice(0, 3).map(g => g.name.toLowerCase());
    } else if (selectedGoalFilter === "all") {
      return allGoals.map(g => g.name.toLowerCase());
    } else if (selectedGoalFilter.startsWith("goal_")) {
      const goalId = parseInt(selectedGoalFilter.replace("goal_", ""), 10);
      const goal = allGoals.find(g => g.id === goalId);
      return goal ? [goal.name.toLowerCase()] : [];
    }
    return [];
  }

  /**
   * Filter recommendations based on selected goals
   */
  function filterRecommendationsByGoals(recommendations) {
    if (!recommendations || recommendations.length === 0) return recommendations;
    
    const selectedNames = getSelectedGoalNames();
    if (selectedNames.length === 0) return recommendations;
    
    // Filter recommendations that impact the selected goals
    const filtered = recommendations.filter(rec => {
      const impactsGoal = (rec.impacts_goal || "").toLowerCase();
      // Include if it matches any selected goal or is a generic impact
      const genericImpacts = ["savings discipline", "cash flow stability", "budget efficiency", "financial health", "spending control", "overall savings", "financial discipline", "budget control"];
      return selectedNames.some(name => impactsGoal.includes(name)) || 
             genericImpacts.some(gi => impactsGoal.includes(gi));
    });
    
    // If filtering results in too few, return all but re-label them
    if (filtered.length < 3) {
      return recommendations.slice(0, 5).map((rec, idx) => {
        const goalNames = allGoals.slice(0, 3).map(g => g.name);
        if (selectedGoalFilter.startsWith("goal_")) {
          const goalId = parseInt(selectedGoalFilter.replace("goal_", ""), 10);
          const goal = allGoals.find(g => g.id === goalId);
          if (goal) {
            return { ...rec, impacts_goal: goal.name };
          }
        }
        // Distribute across selected goals
        const targetGoal = goalNames[idx % goalNames.length] || rec.impacts_goal;
        return { ...rec, impacts_goal: targetGoal };
      });
    }
    
    return filtered;
  }

  /**
   * Assign user's actual goal names to recommendations based on filter selection
   */
  function assignGoalsToRecommendations(recommendations) {
    if (!recommendations || recommendations.length === 0) return recommendations;
    
    let targetGoals = [];
    
    if (selectedGoalFilter === "top3") {
      targetGoals = allGoals.slice(0, 3);
    } else if (selectedGoalFilter === "all") {
      targetGoals = allGoals;
    } else if (selectedGoalFilter.startsWith("goal_")) {
      const goalId = parseInt(selectedGoalFilter.replace("goal_", ""), 10);
      const goal = allGoals.find(g => g.id === goalId);
      if (goal) targetGoals = [goal];
    }
    
    if (targetGoals.length === 0) {
      targetGoals = [{ name: "Primary Goal" }];
    }
    
    // Assign goals in round-robin fashion
    return recommendations.map((rec, idx) => {
      const targetGoal = targetGoals[idx % targetGoals.length];
      return {
        ...rec,
        impacts_goal: targetGoal.name,
        rank: idx + 1
      };
    });
  }

  /**
   * Re-render recommendations with current filter (no new API call)
   */
  function refilterRecommendations() {
    if (!latestHabitData) {
      statusText("Run analysis first to see recommendations.");
      return;
    }
    
    const ranked = Array.isArray(latestHabitData?.ranked_recommendations)
      ? latestHabitData.ranked_recommendations
      : [];
    
    if (ranked.length > 0) {
      const rankedMinimum = ensureMinimumRankedRecommendations(ranked, 5);
      const filteredRanked = filterRecommendationsByGoals(rankedMinimum);
      const finalRanked = assignGoalsToRecommendations(filteredRanked);
      
      renderRankedRecommendations(finalRanked);
      renderQuickWinsFromRanked(finalRanked, latestHabitData?.ai_guidance?.impact_summary, latestHabitData?.quick_wins);
      renderGuidance(latestHabitData?.ai_guidance, finalRanked);
      statusText("Recommendations filtered by selected goals.");
    }
  }

  function formatINR(value, maxFractionDigits = 0) {
    const num = Number(value || 0);
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: maxFractionDigits
    }).format(num);
  }

  function statusText(message, isError = false) {
    if (!analysisStatus) return;
    analysisStatus.textContent = message;
    analysisStatus.style.color = isError ? "var(--color-accent-red)" : "var(--text-muted)";
  }

  function priorityStyle(tier) {
    if (tier === "Critical") return "background: rgba(239, 68, 68, 0.15); color: var(--color-accent-red);";
    if (tier === "High") return "background: rgba(245, 158, 11, 0.15); color: var(--color-accent-orange);";
    if (tier === "Moderate") return "background: rgba(99, 102, 241, 0.15); color: var(--color-primary-light);";
    return "background: rgba(16, 185, 129, 0.15); color: var(--color-accent-green);";
  }

  function difficultyStyle(level) {
    if (level === "Easy") return "background: rgba(16,185,129,0.15); color: var(--color-accent-green);";
    if (level === "Moderate") return "background: rgba(245,158,11,0.15); color: var(--color-accent-orange);";
    return "background: rgba(239,68,68,0.15); color: var(--color-accent-red);";
  }

  function normalizeTier(rec) {
    if (rec.score_tier) return rec.score_tier;
    const score = Number(rec.score || 0);
    if (score >= 0.8) return "Critical";
    if (score >= 0.65) return "High";
    if (score >= 0.5) return "Moderate";
    return "Low";
  }

  function renderNoGoalsState() {
    if (!recList) return;
    recList.innerHTML = `
      <div class="data-card" style="text-align:center; padding:32px; border:1px dashed var(--glass-border);">
        <i data-lucide="target" style="width: 44px; height: 44px; margin: 0 auto 16px; opacity: 0.6;"></i>
        <h3 style="margin-bottom: 8px;">No Goals Found</h3>
        <p style="color: var(--text-muted); margin-bottom: 18px;">Add a financial goal to improve AI ranking quality.</p>
        <a href="goals.html" class="btn btn-primary" style="display: inline-flex; align-items: center; gap: 8px;">
          <i data-lucide="plus" size="18"></i> Create First Goal
        </a>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
  }

  function renderRankedRecommendations(recommendations) {
    if (!recList) return;
    recList.innerHTML = "";

    recommendations.forEach((rec, idx) => {
      const tier = normalizeTier(rec);
      const badgeStyle = priorityStyle(tier);
      const diffStyle = difficultyStyle(rec.difficulty_level || "Moderate");
      const rank = rec.rank || idx + 1;
      const scorePct = Math.round(Number(rec.score || 0) * 100);
      const before = Number(rec.goal_success_probability_before || 60).toFixed(1);
      const after = Number(rec.goal_success_probability_after || 70).toFixed(1);

      const card = document.createElement("div");
      card.className = "rec-card";
      card.innerHTML = `
        <div class="rec-icon-box">
          <i data-lucide="target" size="24"></i>
        </div>
        <div style="flex: 1;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px;">
            <div>
              <span style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); font-weight: 600; letter-spacing: 0.5px;">
                Rank #${rank}
              </span>
              <h3 style="font-size: 1.02rem; font-weight: 600; color: var(--text-primary); margin-top: 2px;">
                ${rec.recommendation || "Apply this optimization step."}
              </h3>
              <div style="margin-top:6px; display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
                <span style="font-size:0.75rem; padding:3px 8px; border-radius:99px; ${badgeStyle}">
                  ${tier}
                </span>
                <span style="font-size:0.75rem; padding:3px 8px; border-radius:99px; ${diffStyle}">
                  ${rec.difficulty_level || "Moderate"}
                </span>
              </div>
            </div>
            <span style="font-size: 0.74rem; padding: 4px 10px; border-radius: 99px; font-weight: 600; ${badgeStyle}">
              Score ${scorePct}%
            </span>
          </div>

          <p style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 10px; line-height: 1.5;">
            ${rec.why_ranked || "Ranked by personalized scoring model."}
          </p>

          <div style="font-size:0.84rem; margin-bottom:8px; color: var(--text-primary);">
            <strong>Impacts:</strong> ${rec.impacts_goal || "Primary Goal"} &nbsp; | &nbsp;
            <strong>Feasibility Impact:</strong> ${Number(rec.feasibility_impact_pct || 0).toFixed(1)}%
          </div>
          <div style="font-size:0.84rem; margin-bottom:10px; color: var(--text-secondary);">
            If applied -> Goal success probability: <strong>${before}%</strong> -> <strong>${after}%</strong>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--glass-border); padding-top: 12px;">
            <div style="display: flex; align-items: center; gap: 6px; font-size: 0.85rem; font-weight: 600; color: var(--color-accent-green);">
              <i data-lucide="calendar-clock" size="16"></i> Timeline reduction: ${Number(rec.goal_timeline_reduction_months || 0).toFixed(1)} months
            </div>
            <span style="font-size: 0.8rem; color: var(--text-muted); font-weight: 600;">Actionable Suggestion</span>
          </div>
        </div>
      `;
      recList.appendChild(card);
    });

    if (window.lucide) window.lucide.createIcons();
  }

  function renderSuggestionCards(dataArray) {
    if (!recList) return;
    recList.innerHTML = "";

    dataArray.forEach((rec) => {
      let badgeStyle = "background: rgba(99, 102, 241, 0.15); color: var(--color-primary-light);";
      if (rec.priority === "High") badgeStyle = "background: rgba(239, 68, 68, 0.15); color: var(--color-accent-red);";
      if (rec.priority === "Medium") badgeStyle = "background: rgba(245, 158, 11, 0.15); color: var(--color-accent-orange);";
      if (rec.priority === "Low") badgeStyle = "background: rgba(16, 185, 129, 0.15); color: var(--color-accent-green);";

      const card = document.createElement("div");
      card.className = "rec-card";
      card.innerHTML = `
        <div class="rec-icon-box">
          <i data-lucide="${rec.icon || "sparkles"}" size="24"></i>
        </div>
        <div style="flex: 1;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px;">
            <div>
              <span style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); font-weight: 600; letter-spacing: 0.5px;">${rec.category || "AI Insight"}</span>
              <h3 style="font-size: 1.1rem; font-weight: 600; color: var(--text-primary); margin-top: 2px;">${rec.title || "Recommendation"}</h3>
            </div>
            <span style="font-size: 0.7rem; padding: 4px 10px; border-radius: 99px; font-weight: 600; text-transform: uppercase; ${badgeStyle}">${rec.priority || "Medium"}</span>
          </div>

          <p style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 16px; line-height: 1.5;">${rec.desc || "No details available."}</p>

          <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--glass-border); padding-top: 12px;">
            <div style="display: flex; align-items: center; gap: 6px; font-size: 0.85rem; font-weight: 600; color: var(--color-accent-green);">
              <i data-lucide="trending-up" size="16"></i> ${rec.impact || "Growth"}
            </div>
            <span style="font-size: 0.8rem; color: var(--text-muted); font-weight: 600;">AI Suggestion</span>
          </div>
        </div>
      `;
      recList.appendChild(card);
    });

    if (window.lucide) window.lucide.createIcons();
  }

  function renderDefaultQuickWins() {
    if (!winList) return;
    winList.innerHTML = "";

    DEFAULT_QUICK_WINS.forEach((win) => {
      const div = document.createElement("div");
      div.className = "win-item";
      div.innerHTML = `
        <span style="color: var(--text-primary);">${win.text}</span>
        <span class="win-save">${win.save}</span>
      `;
      winList.appendChild(div);
    });
  }

  function renderQuickWinsFromRanked(recommendations, impactSummary, quickWinsData = null) {
    if (!winList) return;
    winList.innerHTML = "";

    const summary = impactSummary || FALLBACK_GUIDANCE.impact_summary;

    // Prefer actual quick_wins data from API (based on real expenses)
    if (quickWinsData && Array.isArray(quickWinsData) && quickWinsData.length > 0) {
      quickWinsData.slice(0, 5).forEach((qw) => {
        const div = document.createElement("div");
        div.className = "win-item";
        div.innerHTML = `
          <span style="color: var(--text-primary);">${qw.goal_name}: ${qw.difficulty}</span>
          <span class="win-save">₹${Number(qw.monthly_savings).toLocaleString("en-IN")}/mo</span>
        `;
        winList.appendChild(div);

        const detail = document.createElement("div");
        detail.style.cssText = "font-size:0.78rem; color: var(--text-muted); margin:-4px 0 8px 6px;";
        detail.textContent = `${Number(qw.gap_coverage_pct).toFixed(0)}% gap coverage potential`;
        winList.appendChild(detail);
      });
    } else {
      // Fallback to recommendations-based calculation if no quick_wins data
      const ranked = Array.isArray(recommendations) && recommendations.length > 0
        ? recommendations.slice(0, 3)
        : FALLBACK_RANKED_RECOMMENDATIONS.slice(0, 3);

      // Use actual goal names from the filter
      let goalNames = [];
      if (selectedGoalFilter === "top3") {
        goalNames = allGoals.slice(0, 3).map(g => g.name);
      } else if (selectedGoalFilter === "all") {
        goalNames = allGoals.map(g => g.name);
      } else if (selectedGoalFilter.startsWith("goal_")) {
        const goalId = parseInt(selectedGoalFilter.replace("goal_", ""), 10);
        const goal = allGoals.find(g => g.id === goalId);
        if (goal) goalNames = [goal.name];
      }

      ranked.forEach((rec, idx) => {
        const monthly = Math.max(1200, Math.round(Number(rec.score || 0.5) * 8500));
        const gapCoverage = Math.max(6, Math.round(Number(rec.goal_timeline_reduction_months || 1.2) * 8));
        const goalName = goalNames[idx % Math.max(1, goalNames.length)] || rec.impacts_goal || "Goal";

        const div = document.createElement("div");
        div.className = "win-item";
        div.innerHTML = `
          <span style="color: var(--text-primary);">${goalName}: ${rec.difficulty_level || "Moderate"}</span>
          <span class="win-save">₹${monthly.toLocaleString("en-IN")}/mo</span>
        `;
        winList.appendChild(div);

        const detail = document.createElement("div");
        detail.style.cssText = "font-size:0.78rem; color: var(--text-muted); margin:-4px 0 8px 6px;";
        detail.textContent = `${gapCoverage}% gap coverage potential`;
        winList.appendChild(detail);
      });
    }

    if (potentialSavings) {
      potentialSavings.textContent = `${formatINR(summary.potential_savings_monthly || 0)}/month`;
    }
    if (goalGapCovered) {
      goalGapCovered.textContent = `${Number(summary.goal_gap_covered_pct || 0).toFixed(1)}%`;
    }
    if (timelineReduction) {
      timelineReduction.textContent = `${Number(summary.timeline_reduction_months || 0).toFixed(1)} months`;
    }
  }

  function ensureMinimumRankedRecommendations(recommendations, minCount = 5) {
    const base = Array.isArray(recommendations) ? [...recommendations] : [];
    if (base.length >= minCount) return base.slice(0, minCount);

    const existing = new Set(base.map((r) => String(r?.recommendation || "").trim().toLowerCase()));
    for (const fallback of FALLBACK_RANKED_RECOMMENDATIONS) {
      const key = String(fallback.recommendation || "").trim().toLowerCase();
      if (existing.has(key)) continue;
      base.push({ ...fallback, rank: base.length + 1 });
      existing.add(key);
      if (base.length >= minCount) break;
    }
    return base.slice(0, minCount);
  }

  function ensureMinimumSimpleSuggestions(suggestions, minCount = 3) {
    const base = Array.isArray(suggestions) ? [...suggestions] : [];
    if (base.length >= minCount) return base.slice(0, minCount);

    const existing = new Set(base.map((s) => String(s?.title || "").trim().toLowerCase()));
    for (const fallback of FALLBACK_SIMPLE_RECS) {
      const key = String(fallback.title || "").trim().toLowerCase();
      if (existing.has(key)) continue;
      base.push({ ...fallback });
      existing.add(key);
      if (base.length >= minCount) break;
    }
    return base.slice(0, minCount);
  }

  function renderGuidance(aiGuidance, recommendations) {
    const guidance = aiGuidance || FALLBACK_GUIDANCE;
    const focus = guidance.primary_financial_focus_area || {};
    const roadmap = Array.isArray(guidance.personalized_roadmap_suggestion)
      ? guidance.personalized_roadmap_suggestion
      : [];
    const alignment = guidance.financial_alignment_score || FALLBACK_GUIDANCE.financial_alignment_score;
    const impact = guidance.impact_summary || FALLBACK_GUIDANCE.impact_summary;

    if (financialHealthScore) {
      financialHealthScore.textContent = `${Number(alignment.score_pct || 0).toFixed(1)}% (${alignment.label || "Moderate Optimization Needed"})`;
    }

    if (financialHealthTag) {
      const score = Number(alignment.score_pct || 0);
      let label = "Moderate";
      let bg = "rgba(245, 158, 11, 0.2)";
      let color = "var(--color-accent-orange)";

      if (score >= 85) {
        label = "Strong";
        bg = "rgba(16, 185, 129, 0.2)";
        color = "var(--color-accent-green)";
      } else if (score < 55) {
        label = "Critical";
        bg = "rgba(239, 68, 68, 0.2)";
        color = "var(--color-accent-red)";
      } else if (score < 70) {
        label = "At Risk";
        bg = "rgba(239, 68, 68, 0.15)";
        color = "var(--color-accent-red)";
      }

      financialHealthTag.textContent = label;
      financialHealthTag.style.background = bg;
      financialHealthTag.style.color = color;
    }

    if (primaryFocusText) {
      primaryFocusText.innerHTML = `<strong>Primary Financial Focus Area:</strong> ${focus.message || FALLBACK_GUIDANCE.primary_financial_focus_area.message}`;
    }
    if (monthlyDirectionText) {
      monthlyDirectionText.innerHTML = `<strong>Monthly Strategic Direction:</strong> ${guidance.monthly_strategic_direction || FALLBACK_GUIDANCE.monthly_strategic_direction}`;
    }
    if (roadmapList) {
      const rows = (roadmap.length ? roadmap : FALLBACK_GUIDANCE.personalized_roadmap_suggestion)
        .map((step) => `<div>${step}</div>`)
        .join("");
      roadmapList.innerHTML = `<strong>Personalized Roadmap Suggestion:</strong>${rows}`;
    }
    if (aiInsightText) {
      aiInsightText.innerHTML =
        `Executive view: top actions can optimize approximately <strong>${formatINR(impact.potential_savings_monthly || 0)}/month</strong> and reduce goal timeline by <strong>${Number(impact.timeline_reduction_months || 0).toFixed(1)} months</strong>.`;
    }
    if (technicalWhy) {
      const topRec = Array.isArray(recommendations) && recommendations.length > 0 ? recommendations[0] : null;
      technicalWhy.textContent = topRec?.technical_why
        || `Formula: ${focus.global_priority_formula || FALLBACK_GUIDANCE.primary_financial_focus_area.global_priority_formula}.`;
    }
  }

  function renderHabitInsights(data) {
    if (!habitSummaryEl || !habitMetaEl || !habitRoadmapEl) return;

    const summary = data.unified_summary || "No major habit conflict detected.";
    const alignment = data.ai_guidance?.financial_alignment_score || {};
    const impact = data.ai_guidance?.impact_summary || {};
    const roadmap = Array.isArray(data.ai_guidance?.personalized_roadmap_suggestion)
      ? data.ai_guidance.personalized_roadmap_suggestion
      : [];

    habitSummaryEl.textContent = summary;
    habitMetaEl.innerHTML = `
      <div><strong>Alignment:</strong> ${alignment.label || "--"} (${Number(alignment.score_pct || 0).toFixed(1)}%)</div>
      <div><strong>Potential Savings:</strong> ${formatINR(impact.potential_savings_monthly || 0)}/month</div>
      <div><strong>Timeline Reduction:</strong> ${Number(impact.timeline_reduction_months || 0).toFixed(1)} months</div>
    `;

    habitRoadmapEl.innerHTML = "";
    roadmap.slice(0, 3).forEach((step) => {
      const li = document.createElement("li");
      li.style.marginBottom = "6px";
      li.textContent = step;
      habitRoadmapEl.appendChild(li);
    });
  }

  function renderHabitEmptyState(message) {
    if (!habitSummaryEl || !habitMetaEl || !habitRoadmapEl) return;
    habitSummaryEl.textContent = message;
    habitMetaEl.textContent = "";
    habitRoadmapEl.innerHTML = "";
  }

  async function fetchJson(url) {
    const response = await fetch(url, { credentials: "include" });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.message || payload.error || `HTTP ${response.status}`);
    }
    return response.json();
  }

  async function loadPrimaryGoal() {
    try {
      const goals = await fetchJson("/api/goals");
      if (Array.isArray(goals) && goals.length > 0) return goals[0];
      return null;
    } catch (error) {
      console.warn("Goal load failed:", error.message);
      return null;
    }
  }

  function buildAiAnalysisUrl(goal) {
    if (!goal) return "/api/ai-analysis";

    const amount = Number(goal.target_amount || 0);
    const months = Number(goal.duration_months || 0);
    if (amount > 0 && months > 0) {
      return `/api/ai-analysis?goal_amount=${amount}&months=${months}`;
    }
    return "/api/ai-analysis";
  }

  async function runAnalysis(goal) {
    statusText("Running model analysis...");
    if (runAnalysisBtn) runAnalysisBtn.disabled = true;

    let habitData = null;
    let aiData = null;
    let habitError = null;

    try {
      habitData = await fetchJson("/api/habit-goalconflict");
    } catch (error) {
      habitError = error;
    }

    try {
      aiData = await fetchJson(buildAiAnalysisUrl(goal));
    } catch (error) {
      console.warn("AI analysis fallback unavailable:", error.message);
    }

    const ranked = Array.isArray(habitData?.ranked_recommendations)
      ? habitData.ranked_recommendations
      : [];
    const suggestions = Array.isArray(aiData?.suggestions) ? aiData.suggestions : [];

    if (ranked.length > 0) {
      // Store the full data for re-filtering
      latestHabitData = habitData;
      
      // Apply goal filtering
      const rankedMinimum = ensureMinimumRankedRecommendations(ranked, 5);
      const filteredRanked = filterRecommendationsByGoals(rankedMinimum);
      
      // Re-assign goal names based on user's actual goals
      const finalRanked = assignGoalsToRecommendations(filteredRanked);
      
      renderRankedRecommendations(finalRanked);
      renderQuickWinsFromRanked(finalRanked, habitData?.ai_guidance?.impact_summary, habitData?.quick_wins);
      renderGuidance(habitData?.ai_guidance, finalRanked);
      renderHabitInsights(habitData);
      statusText("Personalized recommendations updated.");
    } else {
      if (suggestions.length > 0) {
        const mapped = suggestions.map((s) => ({
          category: s.category || "AI Insight",
          priority: s.level || "Medium",
          title: s.title,
          desc: s.text,
          impact: s.monetary_gain || "Growth",
          action: s.action_label || "View",
          icon: s.icon_name || "sparkles"
        }));
        renderSuggestionCards(ensureMinimumSimpleSuggestions(mapped, 3));
      } else {
        renderSuggestionCards(ensureMinimumSimpleSuggestions(FALLBACK_SIMPLE_RECS, 3));
      }

      renderQuickWinsFromRanked(FALLBACK_RANKED_RECOMMENDATIONS, FALLBACK_GUIDANCE.impact_summary);
      renderGuidance(FALLBACK_GUIDANCE, FALLBACK_RANKED_RECOMMENDATIONS);

      if (habitError) {
        const reason = habitError.message || "Habit-goal conflict engine is offline.";
        renderHabitEmptyState(`Habit analysis not ready: ${reason}`);
        statusText(`Habit analysis not ready: ${reason}. Showing baseline recommendations.`, true);
      } else {
        renderHabitEmptyState("No ranked output returned by the habit model.");
        statusText("No ranked output returned. Showing baseline recommendations.");
      }
    }

    if (runAnalysisBtn) runAnalysisBtn.disabled = false;
    if (window.lucide) window.lucide.createIcons();
  }

  if (runAnalysisBtn) {
    runAnalysisBtn.addEventListener("click", () => runAnalysis(latestGoal));
  }

  // Goal filter change handler
  if (goalFilterSelect) {
    goalFilterSelect.addEventListener("change", (e) => {
      selectedGoalFilter = e.target.value;
      renderGoalChips();
      refilterRecommendations();
    });
  }

  async function initialize() {
    renderDefaultQuickWins();
    renderGuidance(FALLBACK_GUIDANCE, FALLBACK_RANKED_RECOMMENDATIONS);
    renderHabitEmptyState("Loading habit intelligence...");

    // Load all goals first for the filter
    await loadAllGoals();

    latestGoal = await loadPrimaryGoal();
    if (!latestGoal && allGoals.length === 0) {
      renderNoGoalsState();
      statusText("No goal found. Running baseline analysis.");
    }

    await runAnalysis(latestGoal);
  }

  initialize();
});
