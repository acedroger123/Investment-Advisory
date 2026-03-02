
document.addEventListener("DOMContentLoaded", async () => {
  // 0. Chart.js Defaults (Safe check)
  if (typeof Chart !== 'undefined') {
    Chart.defaults.color = '#94a3b8';
    Chart.defaults.borderColor = '#1e293b';
    Chart.defaults.font.family = 'Inter';
  }

  const hlContainer = document.getElementById("highlightsContainer");
  const goalContainer = document.getElementById("goalsProgressContainer");
  const reviewSubtitle = document.querySelector(".page-header .subtitle");
  const rateChangeEl = document.getElementById("rateChange");

  const INCOME_RANGE_LABELS = {
    1: "Below ₹20,000/month",
    2: "₹20,000 - ₹50,000/month",
    3: "₹50,000 - ₹1,00,000/month",
    4: "Above ₹1,00,000/month"
  };

  const INCOME_RANGE_ESTIMATED_MONTHLY = {
    1: 20000,
    2: 35000,
    3: 75000,
    4: 120000
  };

  const SAVINGS_BUCKET_TO_RATIO = {
    1: 0.08,
    2: 0.15,
    3: 0.25,
    4: 0.35
  };


  function toValidDate(value) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function updateReviewSubtitle(referenceDate) {
    if (!reviewSubtitle) return;
    const d = toValidDate(referenceDate);
    if (!d) return;
    reviewSubtitle.textContent = `📅 ${d.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}`;
  }

  function pickLatestMonthExpenses(expenses) {
    const normalized = (Array.isArray(expenses) ? expenses : [])
      .map((e) => {
        const d = toValidDate(e.date);
        const amount = Number(e.amount || 0);
        if (!d || !Number.isFinite(amount) || amount <= 0) return null;
        return { ...e, amount, _date: d };
      })
      .filter(Boolean);

    if (normalized.length === 0) return [];

    normalized.sort((a, b) => b._date.getTime() - a._date.getTime());
    const latest = normalized[0]._date;
    const month = latest.getMonth();
    const year = latest.getFullYear();

    const monthExpenses = normalized.filter((e) => e._date.getMonth() === month && e._date.getFullYear() === year);
    updateReviewSubtitle(latest);
    return monthExpenses;
  }

  function buildBreakdownFromExpenses(expenses) {
    const byCategory = {};
    expenses.forEach((e) => {
      const category = e.category || "Other";
      byCategory[category] = (byCategory[category] || 0) + Number(e.amount || 0);
    });

    return Object.entries(byCategory)
      .map(([category, total]) => ({ category, total: Number(total.toFixed(2)) }))
      .sort((a, b) => b.total - a.total);
  }

  function buildWeeklyFromExpenses(expenses) {
    const byDay = new Array(7).fill(0);
    expenses.forEach((e) => {
      const idx = e._date?.getDay();
      if (Number.isInteger(idx) && idx >= 0 && idx <= 6) {
        byDay[idx] += Number(e.amount || 0);
      }
    });

    return byDay
      .map((total, day_idx) => ({ day_idx, total: Number(total.toFixed(2)) }))
      .filter((row) => row.total > 0);
  }

  function normalizeSavingsRatio(surveyProfile) {
    const ratio = Number(surveyProfile?.savings_ratio || 0);
    if (Number.isFinite(ratio) && ratio > 0 && ratio <= 1) return ratio;

    const bucket = Number(surveyProfile?.savings_percent || 0);
    if (Number.isFinite(bucket) && bucket > 0 && bucket <= 4) {
      return SAVINGS_BUCKET_TO_RATIO[Math.round(bucket)] || 0.10;
    }

    if (Number.isFinite(bucket) && bucket > 4 && bucket <= 100) {
      return bucket / 100;
    }

    return 0.10;
  }

  function resolveIncomeContext(profile, surveyProfile) {
    const defaultMonthly = 60000;
    const bucketRaw = Number(surveyProfile?.annual_income_range ?? profile?.annual_income_range ?? 0);
    const hasRangeSelection = Number.isFinite(bucketRaw) && bucketRaw >= 1 && bucketRaw <= 4;

    const annualEstimate = Number(surveyProfile?.annual_income_estimate || 0);
    let monthlyIncome = defaultMonthly;
    let source = "default";

    if (hasRangeSelection) {
      monthlyIncome = INCOME_RANGE_ESTIMATED_MONTHLY[Math.round(bucketRaw)] || defaultMonthly;
      source = "range_estimate";
    } else if (Number.isFinite(bucketRaw) && bucketRaw > 4) {
      monthlyIncome = bucketRaw / 12;
      source = "exact_annual";
    } else if (annualEstimate > 0) {
      monthlyIncome = annualEstimate / 12;
      source = "survey_annual_estimate";
    }

    const rangeLabel = hasRangeSelection
      ? (INCOME_RANGE_LABELS[Math.round(bucketRaw)] || `Income range ${Math.round(bucketRaw)}`)
      : "";

    return {
      monthlyIncome: Number.isFinite(monthlyIncome) && monthlyIncome > 0 ? monthlyIncome : defaultMonthly,
      hasRangeSelection,
      rangeLabel,
      source
    };
  }

  function ensureIncomeContextCard() {
    let section = document.getElementById("incomeContextSection");
    if (section) return section;

    const statsGrid = document.querySelector(".stats-grid");
    if (!statsGrid || !statsGrid.parentNode) return null;

    section = document.createElement("section");
    section.id = "incomeContextSection";
    section.className = "data-section";
    section.style.gridTemplateColumns = "1fr";
    section.style.marginTop = "14px";
    section.innerHTML = `
      <div class="data-card" style="padding:14px 16px;">
        <div id="incomeContextBody" style="display:flex; flex-direction:column; gap:10px;"></div>
      </div>
    `;

    statsGrid.insertAdjacentElement("afterend", section);
    return section;
  }

  function renderIncomeContextCard(incomeContext, savingsRatio, baselineSavings, dataConfidence) {
    const section = ensureIncomeContextCard();
    const body = section?.querySelector("#incomeContextBody");
    if (!body) return;

    const ratioPct = Math.round(savingsRatio * 100);
    const confidencePct = Math.round(dataConfidence * 100);

    if (incomeContext.hasRangeSelection) {
      body.innerHTML = `
        <div style="font-size:0.9rem; color: var(--text-secondary);">
          Your income is currently based on questionnaire range: <strong>${incomeContext.rangeLabel}</strong>.
          For accurate review metrics, update income from <strong>Settings</strong> after OTP verification.
        </div>
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
          <a href="settings.html" class="btn btn-primary btn-sm" style="text-decoration:none;">Go to Settings</a>
        </div>
        <div style="font-size:0.82rem; color: var(--text-muted);">
          Baseline savings shown using your declared savings habit (<strong>${ratioPct}%</strong>) = <strong>${formatCurrency(baselineSavings)}</strong>/month.
          Live data confidence: <strong>${confidencePct}%</strong>.
        </div>
      `;
      return;
    }

    body.innerHTML = `
      <div style="font-size:0.9rem; color: var(--text-secondary);">
        Using profile income and questionnaire savings habit.
        <span style="display:block; font-size:0.82rem; color: var(--text-muted); margin-top:3px;">
          Savings baseline = <strong>${ratioPct}%</strong> of income (${formatCurrency(baselineSavings)}/month). Live data confidence: <strong>${confidencePct}%</strong>.
        </span>
      </div>
    `;
  }

  // --- 1. FETCH REAL DATA FROM BACKEND ---
  async function fetchReviewData() {
    console.log("Fetching review data...");
    try {
      // Helper for safe fetching
      const safeJson = async (fetchPromise) => {
        try {
          const res = await fetchPromise;
          if (!res.ok) {
            console.warn(`Fetch failed: ${res.status}`);
            return null;
          }
          return await res.json();
        } catch (e) {
          console.warn("Fetch error:", e);
          return null;
        }
      };

      // A. Fetch Income (Profile)
      // Default empty object if fails
      const profile = await safeJson(fetch("/profile/full", { credentials: "include" })) || {};
      const surveyProfile = await safeJson(fetch("/api/user-survey-profile", { credentials: "include" })) || {};

      // B. Fetch Expenses Aggregations
      // Default empty array if fails (e.g. server down/restarting)
      const breakdownRaw = await safeJson(fetch("/api/expenses/breakdown", { credentials: "include" })) || [];
      const weeklyRaw = await safeJson(fetch("/api/expenses/weekly", { credentials: "include" })) || [];
      const allExpensesRaw = await safeJson(fetch("/api/expenses", { credentials: "include" })) || [];

      // Ensure they are arrays (handle 500 error JSON responses)
      let breakdownArr = Array.isArray(breakdownRaw) ? breakdownRaw : [];
      let weeklyArr = Array.isArray(weeklyRaw) ? weeklyRaw : [];
      const allExpenses = Array.isArray(allExpensesRaw) ? allExpensesRaw : [];

      // Fallback: if current-month endpoint returns empty, derive from latest month with data.
      if ((breakdownArr.length === 0 || weeklyArr.length === 0) && allExpenses.length > 0) {
        const latestMonthExpenses = pickLatestMonthExpenses(allExpenses);
        if (latestMonthExpenses.length > 0) {
          if (breakdownArr.length === 0) breakdownArr = buildBreakdownFromExpenses(latestMonthExpenses);
          if (weeklyArr.length === 0) weeklyArr = buildWeeklyFromExpenses(latestMonthExpenses);
        }
      } else if (allExpenses.length > 0) {
        const latestMonthExpenses = pickLatestMonthExpenses(allExpenses);
        if (latestMonthExpenses.length > 0) {
          updateReviewSubtitle(latestMonthExpenses[0]._date);
        }
      }

      // C. Fetch Goals (Investment Goals via FastAPI or Legacy)
      let goals = [];
      try {
        if (window.API && API.Goals) {
          // Try new system first
          goals = await API.Goals.list().catch(() => null);
        }

        // Fallback to legacy if API missing or list returned null
        if (!goals) {
          const g = await safeJson(fetch("/api/goals", { credentials: "include" }));
          goals = Array.isArray(g) ? g : [];
        }
      } catch (e) {
        console.warn("Goals fetch error:", e);
        goals = [];
      }
      if (!Array.isArray(goals)) goals = [];

      // D. Fetch Goal Progress
      const goalProgressData = await fetchGoalProgress(goals);

      console.log("Processing data:", {
        profile: !!profile,
        breakdown: breakdownArr.length,
        weekly: weeklyArr.length,
        goals: goalProgressData.length
      });

      processAndRender(profile, surveyProfile, breakdownArr, weeklyArr, goalProgressData, {
        allExpensesCount: allExpenses.length
      });

    } catch (err) {
      console.error("Critical Review Data Load Error:", err);
      // Ensure UI shows something even if criticial fail
      processAndRender({}, {}, [], [], [], { allExpensesCount: 0 });
    }
  }

  async function fetchGoalProgress(goals) {
    if (!goals || goals.length === 0) return [];

    const promises = goals.map(async (g) => {
      try {
        // Try to get portfolio summary for investment goals
        if (window.API && API.Portfolio) {
          const portfolio = await API.Portfolio.get(g.id);
          return {
            name: g.name,
            target: parseFloat(g.target_value || g.target_amount || 0),
            current: parseFloat(portfolio.summary?.total_current_value || 0),
            invested: parseFloat(portfolio.summary?.total_invested || 0),
            progress: portfolio.summary?.progress_percentage || 0
          };
        } else {
          throw new Error("No API");
        }
      } catch (e) {
        // Fallback for legacy goals (no portfolio data)
        return {
          name: g.name,
          target: parseFloat(g.target_value || g.target_amount || 0),
          current: 0,
          invested: 0,
          progress: 0
        };
      }
    });

    return await Promise.all(promises);
  }

  // --- 2. PROCESSING LOGIC ---
  function processAndRender(profile, surveyProfile, breakdown, weekly, goalsData, meta = {}) {
    // --- Calculate Totals ---
    const totalExpenses = breakdown.reduce((sum, item) => sum + parseFloat(item.total || 0), 0);

    const incomeContext = resolveIncomeContext(profile, surveyProfile);
    const monthlyIncome = incomeContext.monthlyIncome;
    const savingsRatio = normalizeSavingsRatio(surveyProfile);
    const baselineSavings = monthlyIncome * savingsRatio;
    const observedSavings = monthlyIncome - totalExpenses;

    const expenseSignal = Math.min(Number(meta.allExpensesCount || 0) / 20, 1);
    const goalsCount = Array.isArray(goalsData) ? goalsData.length : 0;
    const fundedGoals = (Array.isArray(goalsData) ? goalsData : []).filter((g) => {
      const current = Number(g.current || 0);
      const invested = Number(g.invested || 0);
      return current > 0 || invested > 0;
    }).length;

    const goalsSignal = goalsCount > 0 ? Math.min(goalsCount / 4, 1) : 0;
    const fundingSignal = goalsCount > 0 ? Math.min(fundedGoals / goalsCount, 1) : 0;

    const dataConfidence = expenseSignal > 0
      ? Math.min(0.9, (expenseSignal * 0.7) + (goalsSignal * 0.15) + (fundingSignal * 0.15))
      : Math.min(0.25, (goalsSignal * 0.15) + (fundingSignal * 0.1));

    const blendedSavings = (baselineSavings * (1 - dataConfidence)) + (observedSavings * dataConfidence);
    const saved = Number.isFinite(blendedSavings) ? blendedSavings : baselineSavings;
    const savingsRate = monthlyIncome > 0 ? Math.round((saved / monthlyIncome) * 100) : 0;

    // --- Render KPI Stats ---
    const incomeText = incomeContext.hasRangeSelection
      ? incomeContext.rangeLabel
      : formatCurrency(monthlyIncome);
    updateText("incomeVal", incomeText);
    updateText("expensesVal", formatCurrency(totalExpenses));
    updateText("savedVal", formatCurrency(saved));
    updateText("rateVal", `${savingsRate}%`);
    if (rateChangeEl) {
      const confidencePct = Math.round(dataConfidence * 100);
      rateChangeEl.textContent = confidencePct > 0
        ? `${confidencePct}% based on live financial data`
        : `Baseline from ${Math.round(savingsRatio * 100)}% savings habit`;
      rateChangeEl.className = `stat-change ${saved >= 0 ? "positive" : "negative"}`;
    }

    renderIncomeContextCard(incomeContext, savingsRatio, baselineSavings, dataConfidence);

    // --- Render Highlights ---
    renderHighlights(hlContainer, totalExpenses, breakdown, weekly);

    // --- Render Goals ---
    renderGoals(goalContainer, goalsData);

    // --- Render Charts ---
    renderCharts(breakdown, weekly);
  }

  function updateText(id, text) {
    const el = document.getElementById(id);
    if (el) el.innerText = text;
  }

  function renderHighlights(container, totalExpenses, breakdown, weekly) {
    if (!container) return;
    container.innerHTML = "";

    const highlights = [];

    // 1. Expense Alert
    const avgWeekly = totalExpenses / 4;
    const currentWeekTotal = weekly.reduce((sum, d) => sum + parseFloat(d.total || 0), 0);

    if (currentWeekTotal > avgWeekly * 1.2 && avgWeekly > 0) {
      highlights.push({ text: "Alert: This week's spending is 20% above average.", type: "neg" });
    } else if (currentWeekTotal < avgWeekly * 0.8 && currentWeekTotal > 0) {
      highlights.push({ text: "Great! Spending is below weekly average.", type: "pos" });
    }

    // 2. Category Alert
    const sortedCats = [...breakdown].sort((a, b) => parseFloat(b.total) - parseFloat(a.total));
    if (sortedCats.length > 0) {
      const topCat = sortedCats[0];
      highlights.push({ text: `Top spending: ${topCat.category} (${formatCurrency(topCat.total)})`, type: "neutral" });
    }

    if (highlights.length === 0) {
      highlights.push({ text: "No special alerts for this month yet.", type: "neutral" });
    }

    // Render
    highlights.forEach(h => {
      const div = document.createElement("div");
      div.className = `highlight-item ${h.type === 'pos' ? 'highlight-positive' : h.type === 'neg' ? 'highlight-negative' : ''}`;
      const icon = h.type === 'pos' ? '📈' : h.type === 'neg' ? '⚠️' : 'ℹ️';
      div.innerHTML = `<span>${icon}</span> <span>${h.text}</span>`;
      container.appendChild(div);
    });
  }

  function renderGoals(container, goals) {
    if (!container) return;
    container.innerHTML = "";

    if (goals.length === 0) {
      container.innerHTML = '<div style="padding:10px; color:var(--text-muted); font-size:0.9rem;">No active goals found.</div>';
      return;
    }

    goals.slice(0, 3).forEach(g => {
      let percent = g.target > 0 ? (g.current / g.target) * 100 : 0;
      percent = Math.min(100, Math.max(0, percent));

      const div = document.createElement("div");
      div.className = "goal-row";
      div.innerHTML = `
              <div class="goal-header">
                <span>${g.name}</span>
                <span style="color: var(--text-muted)">${formatCurrency(g.current)} / ${formatCurrency(g.target)}</span>
              </div>
              <div class="goal-track">
                <div class="goal-fill" style="width: ${percent}%; background-color: var(--color-accent-blue, #3b82f6);"></div>
              </div>
            `;
      container.appendChild(div);
    });
  }

  function renderCharts(breakdown, weekly) {
    if (typeof Chart === 'undefined') return;

    // Pie Chart (Expenses)
    const categories = breakdown.map(b => b.category);
    const data = breakdown.map(b => parseFloat(b.total || 0));

    const pieCtx = document.getElementById('categoryPie');
    if (pieCtx) {
      // Destroy existing chart if stored on canvas property
      if (pieCtx.chartInstance) pieCtx.chartInstance.destroy();

      pieCtx.chartInstance = new Chart(pieCtx.getContext('2d'), {
        type: 'doughnut',
        data: {
          labels: categories.length ? categories : ['No Data'],
          datasets: [{
            data: data.length ? data : [1], // Placeholder if empty
            backgroundColor: data.length ? ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'] : ['#1e293b'],
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '70%',
          plugins: {
            legend: { position: 'right', labels: { usePointStyle: true, color: '#94a3b8' } }
          }
        }
      });
    }

    // Weekly Bar Chart
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const weeklyData = new Array(7).fill(0);

    weekly.forEach(item => {
      const idx = parseInt(item.day_idx); // 0-6
      if (!isNaN(idx) && idx >= 0 && idx < 7) {
        weeklyData[idx] = parseFloat(item.total || 0);
      }
    });

    const barCtx = document.getElementById('weeklyBar');
    if (barCtx) {
      if (window.myBarChart) window.myBarChart.destroy();

      window.myBarChart = new Chart(barCtx.getContext('2d'), {
        type: 'bar',
        data: {
          labels: days.map(d => d.substring(0, 3)),
          datasets: [{
            label: 'Spending',
            data: weeklyData,
            backgroundColor: '#3b82f6',
            borderRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: {
              beginAtZero: true,
              ticks: { callback: (v) => '₹' + v.toLocaleString(), color: '#94a3b8' },
              grid: { color: 'rgba(255,255,255,0.05)' }
            },
            x: {
              ticks: { color: '#94a3b8' },
              grid: { display: false }
            }
          }
        }
      });
    }
  }

  function formatCurrency(val) {
    if (window.formatCurrency) return window.formatCurrency(val);
    return '₹' + (val || 0).toLocaleString('en-IN');
  }

  fetchReviewData();
});
