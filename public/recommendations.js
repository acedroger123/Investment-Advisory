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
    }
  ];

  const FALLBACK_RANKED_RECOMMENDATIONS = [
    {
      rank: 1,
      recommendation: "Set a weekly budget cap and track adherence.",
      score: 0.87,
      score_tier: "Critical",
      why_ranked: "High discretionary volatility is delaying core goals.",
      impacts_goal: "Emergency Buffer",
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
      impacts_goal: "Emergency Buffer",
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
      impacts_goal: "Emergency Buffer",
      feasibility_impact_pct: -7.0,
      goal_success_probability_before: 64.0,
      goal_success_probability_after: 72.0,
      goal_timeline_reduction_months: 1.5,
      difficulty_level: "Behavioral Shift Required",
      technical_why: "Dominant factor: night ratio and impulse exposure."
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

  function renderQuickWinsFromRanked(recommendations, impactSummary) {
    if (!winList) return;
    winList.innerHTML = "";

    const ranked = Array.isArray(recommendations) && recommendations.length > 0
      ? recommendations.slice(0, 3)
      : FALLBACK_RANKED_RECOMMENDATIONS.slice(0, 3);
    const summary = impactSummary || FALLBACK_GUIDANCE.impact_summary;

    ranked.forEach((rec) => {
      const monthly = Math.max(1200, Math.round(Number(rec.score || 0.5) * 8500));
      const gapCoverage = Math.max(6, Math.round(Number(rec.goal_timeline_reduction_months || 1.2) * 8));

      const div = document.createElement("div");
      div.className = "win-item";
      div.innerHTML = `
        <span style="color: var(--text-primary);">${rec.impacts_goal || "Goal"}: ${rec.difficulty_level || "Moderate"}</span>
        <span class="win-save">₹${monthly.toLocaleString("en-IN")}/mo</span>
      `;
      winList.appendChild(div);

      const detail = document.createElement("div");
      detail.style.cssText = "font-size:0.78rem; color: var(--text-muted); margin:-4px 0 8px 6px;";
      detail.textContent = `${gapCoverage}% gap coverage potential`;
      winList.appendChild(detail);
    });

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
      renderRankedRecommendations(ranked);
      renderQuickWinsFromRanked(ranked, habitData?.ai_guidance?.impact_summary);
      renderGuidance(habitData?.ai_guidance, ranked);
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
        renderSuggestionCards(mapped);
      } else {
        renderSuggestionCards(FALLBACK_SIMPLE_RECS);
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

  async function initialize() {
    renderDefaultQuickWins();
    renderGuidance(FALLBACK_GUIDANCE, FALLBACK_RANKED_RECOMMENDATIONS);
    renderHabitEmptyState("Loading habit intelligence...");

    latestGoal = await loadPrimaryGoal();
    if (!latestGoal) {
      renderNoGoalsState();
      statusText("No goal found. Running baseline analysis.");
    }

    await runAnalysis(latestGoal);
  }

  initialize();
});
